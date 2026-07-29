// hn-hiring.ts
// File: src/discovery/stage3/sources/hn-hiring.ts
// Purpose: Hacker News "Ask HN: Who is hiring?" query_net source. Two fixed
//          requests per run; the operator's scope drives the PREFILTER, not
//          the request.
//
// ── Live-confirmed API shape (2026-07-28) ───────────────────────────────────
//   1. GET https://hn.algolia.com/api/v1/search_by_date
//          ?tags=story,author_whoishiring&hitsPerPage=10
//      → 200 {nbHits, hits[{objectID, title, created_at, num_comments}]}
//      First matching hit: "Ask HN: Who is hiring? (July 2026)", 48747976.
//   2. GET https://hn.algolia.com/api/v1/items/48747976
//      → 200, 513 KB, whole thread in ONE request.
//        children[] = 276 top-level comments, each {id, author, text, ...}.
//
// ── search_by_date, NEVER plain search (structural constraint) ──────────────
// Phase 0c proved the relevance-sorted `search?query=Ask HN: Who is hiring`
// endpoint returns STALE threads — it surfaced a March 2020 COVID-edition
// thread and a November 2016 thread, neither current. `search_by_date` returns
// the current month's thread first. Re-confirmed live this wave. A test asserts
// the request URL uses search_by_date and never bare /search.
//
// ── The title filter is load-bearing ────────────────────────────────────────
// `author_whoishiring` also posts "Ask HN: Who WANTS TO BE HIRED?" at the same
// timestamp every month — it appeared as hit[1] with an identical created_at.
// Taking hits[0] blindly would eventually ingest a thread of job SEEKERS as if
// they were job postings. Selection matches /who is hiring/i on the title.
//
// ── The prefilter runs FIRST (structural constraint) ────────────────────────
// `prefilterComments` is the ONLY path from thread children to RawItems in
// this file — there is no second route. Non-matching comments are never built
// into items, so they never reach prerank and never reach the pipeline's ~4
// Gemini calls per item. Measured on the real thread: 276 comments, only ~34
// mention anything in scope — an ~8x reduction before anything is spent.
//
// This source itself spends ZERO LLM budget. It does not parse the loose
// "Company | Role | Location" convention, which Phase 0c found directional but
// not rigid (field order and count vary per poster). A surviving comment
// becomes one RawItem carrying its raw text; Engine 1 and prerank take it from
// there. Adapters transport — they do not classify.

import type { RawItem } from "../../../engines/normalization/types";
import type { Preferences } from "../../scope/types";
import type { FetchResult, HealthCheckResult, SourceDeps, SourceError, Stage3Source } from "../types";
import { getJson, isRecord, readArray, str } from "../query/http-json";
import { deriveQueryTerms } from "../query/scope-terms";
import { decodeCommentText, liftCompany, prefilterComments, type PrefilterInput } from "../query/hn-prefilter";

export interface HnConfig {
  /** MUST be the search_by_date endpoint — see the header note. */
  searchByDateUrl: string;
  itemsUrl: string;
  tags: string;
  hitsPerPage: number;
  /** Which thread title counts as a hiring thread. */
  titlePattern: RegExp;
}

export const HN_CONFIG: HnConfig = {
  searchByDateUrl: "https://hn.algolia.com/api/v1/search_by_date",
  itemsUrl: "https://hn.algolia.com/api/v1/items",
  tags: "story,author_whoishiring",
  hitsPerPage: 10,
  titlePattern: /who\s+is\s+hiring/i,
};

const SOURCE_NAME = "hn-hiring";

export function threadSearchUrl(config: HnConfig): string {
  const params = new URLSearchParams({ tags: config.tags, hitsPerPage: String(config.hitsPerPage) });
  return `${config.searchByDateUrl}?${params.toString()}`;
}

export interface HnThread {
  objectID: string;
  title: string;
}

/**
 * Find the most recent "Who is hiring?" thread. `search_by_date` returns
 * newest-first, so the first TITLE-MATCHING hit is the current thread.
 */
async function findCurrentThread(
  config: HnConfig,
  deps: SourceDeps
): Promise<{ thread: HnThread | null; errors: SourceError[] }> {
  const scope = `${SOURCE_NAME}:thread-search`;
  const response = await getJson(threadSearchUrl(config), scope, deps);
  if (!response.ok) return { thread: null, errors: [response.error] };

  const hits = readArray(response.data, "hits", scope, true);
  if (!hits.ok) return { thread: null, errors: [hits.error] };

  for (const hit of hits.items) {
    if (!isRecord(hit)) continue;
    const title = str(hit, "title");
    const objectID = str(hit, "objectID");
    if (title && objectID && config.titlePattern.test(title)) {
      return { thread: { objectID, title }, errors: [] };
    }
  }

  return {
    thread: null,
    errors: [
      {
        scope,
        kind: "shape",
        detail: `no hit matching ${config.titlePattern} in the newest ${config.hitsPerPage} ${config.tags} stories`,
      },
    ],
  };
}

interface HnComment extends PrefilterInput {
  id: number | string;
  text: string;
  author: string | null;
  created_at: string | null;
}

/** Top-level comments carrying text. Deleted/empty children are skipped. */
function readComments(data: unknown, scope: string): { comments: HnComment[]; errors: SourceError[] } {
  const children = readArray(data, "children", scope, true);
  if (!children.ok) return { comments: [], errors: [children.error] };

  const comments: HnComment[] = [];
  for (const child of children.items) {
    if (!isRecord(child)) continue;
    const text = typeof child.text === "string" ? child.text : null;
    const id = typeof child.id === "number" || typeof child.id === "string" ? child.id : null;
    if (text === null || text.trim() === "" || id === null) continue;
    comments.push({ id, text, author: str(child, "author"), created_at: str(child, "created_at") });
  }

  return { comments, errors: [] };
}

async function fetchHn(config: HnConfig, preferences: Preferences, deps: SourceDeps): Promise<FetchResult> {
  const errors: SourceError[] = [];

  const { thread, errors: searchErrors } = await findCurrentThread(config, deps);
  errors.push(...searchErrors);
  if (!thread) return { items: [], errors };

  const scope = `${SOURCE_NAME}:${thread.objectID}`;
  const response = await getJson(`${config.itemsUrl}/${thread.objectID}`, scope, deps);
  if (!response.ok) return { items: [], errors: [...errors, response.error] };

  const { comments, errors: commentErrors } = readComments(response.data, scope);
  errors.push(...commentErrors);

  // THE PREFILTER. Nothing below this line sees a non-matching comment.
  const { terms } = deriveQueryTerms(preferences);
  const { passed } = prefilterComments(comments, terms);

  let lifted = 0;
  const items: RawItem[] = passed.map(({ comment, matched }) => {
    // Decoded, NOT the prefilter's `cleaned` — that one is lowercased for
    // matching, and a company name must keep its capitalisation.
    const decoded = decodeCommentText(comment.text);
    const company = liftCompany(decoded);
    if (company !== null) lifted += 1;

    return {
      source_type: "network" as const,
      source_name: SOURCE_NAME,
      raw_payload: {
        thread_id: thread.objectID,
        thread_title: thread.title,
        comment_id: comment.id,
        author: comment.author,
        created_at: comment.created_at,
        // Lifted so Engine 1 can fingerprint. "" when the comment does not
        // follow the delimiter convention — those comments collapse onto one
        // fingerprint, which the ratio guard below makes visible.
        company: company ?? "",
        // Engine 1's job_board adapter reads `description`; this is the whole
        // comment, untruncated, so it is genuine content and belongs there.
        description: decoded,
        matched_scope_terms: matched,
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
      },
      url: `https://news.ycombinator.com/item?id=${comment.id}`,
      fetched_at: deps.now(),
    };
  });

  // ── THE RATIO GUARD (operator ruling, 2026-07-28) ───────────────────────
  // A drop in yield caused by HN's convention drifting must look like a HEALTH
  // SIGNAL, not like a quiet loss. This is loud but NOT auto-disabling: it goes
  // into fetch errors (surfaced in the run summary) while healthCheck stays
  // green, because a convention change is not the source being broken.
  if (passed.length > 0 && lifted * 2 < passed.length) {
    errors.push({
      scope: `${SOURCE_NAME}:${thread.objectID}`,
      kind: "shape",
      detail:
        `company lifted from ${lifted}/${passed.length} comments — the ` +
        `"Company | Role | Location" delimiter convention may have changed. ` +
        `Comments without a company share one fingerprint and dedupe against each other.`,
    });
  }

  return { items, errors };
}

/**
 * The HN Who-is-hiring source.
 *
 * @param preferences the operator's CONFIRMED discovery scope, injected via
 *        SourceBuildContext. Drives the prefilter, not the requests.
 * @throws {Error} at build time when no confirmed scope was supplied.
 */
export function createHnHiringSource(config: HnConfig = HN_CONFIG, preferences?: Preferences): Stage3Source {
  if (!preferences) {
    throw new Error(
      "hn-hiring needs the operator's confirmed discovery scope (preferences.json). " +
        "Run `oaos setup-scope` and confirm your scope."
    );
  }

  return {
    name: SOURCE_NAME,
    family: "query_net",
    enabled: true,
    fetch: (deps) => fetchHn(config, preferences, deps),

    // One request: can we still locate the current thread? The expensive part
    // (the 513 KB thread body) is deliberately not re-fetched for a health
    // check.
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const { thread, errors } = await findCurrentThread(config, deps);
      const ok = thread !== null && errors.length === 0;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok ? `ok, current thread "${thread?.title}"` : `failed: ${errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
