// himalayas.ts
// File: src/discovery/stage3/sources/himalayas.ts
// Purpose: Himalayas query_net source — one search per enabled scope field.
//          Best content quality of the five Wave 5 sources: full HTML
//          descriptions (avg ~5-6 KB) plus structured geo fields.
//
// ── Live-confirmed API shape (2026-07-28) ───────────────────────────────────
//   GET https://himalayas.app/jobs/api/search?q=<term>
//   → 200 {comments, updatedAt, offset, limit, totalCount, jobs[]}
//   q=kubernetes → totalCount 83, 19 jobs returned, 19/19 genuinely on-topic.
//
// ── WHY THERE ARE NO limit/offset PARAMS ON THE REQUEST ─────────────────────
// Both are IGNORED by the search endpoint. Live-verified: sending
// `limit=100&offset=20` came back echoing `limit: 20, offset: 0` with the
// byte-identical 19 guids from the first page. There is no pagination here —
// you get a fixed top ~20 of the match set, and that is the whole source.
// Sending the params anyway would imply a control we do not have. If a future
// session "adds pagination" to this file, re-verify first: as of this wave the
// server simply does not honour it.
//
// (The sibling firehose endpoint `/jobs/api` — no `q` at all, ~4,000 new
// postings/day, `query=` silently ignored — is deliberately NOT used. It was
// measured and rejected during Wave 5 Step 1: 20 jobs spanned 7 minutes of
// postings, so it can never be a coverage mechanism at any page count.)
//
// Descriptions are FULL here, so no content quarantine applies — contrast
// adzuna.ts and freehire.ts, which cannot say the same.

import type { RawItem } from "../../../engines/normalization/types";
import type { Preferences } from "../../scope/types";
import type { FetchResult, HealthCheckResult, SourceDeps, SourceError, Stage3Source } from "../types";
import { getJson, isRecord, readArray, str } from "../query/http-json";
import { cappedTermsError, deriveQueryTerms } from "../query/scope-terms";

export interface HimalayasConfig {
  searchUrl: string;
}

export const HIMALAYAS_CONFIG: HimalayasConfig = {
  searchUrl: "https://himalayas.app/jobs/api/search",
};

const SOURCE_NAME = "himalayas";

function searchUrlFor(config: HimalayasConfig, term: string): string {
  return `${config.searchUrl}?q=${encodeURIComponent(term)}`;
}

/**
 * One query. Returns the term's items plus any error — a failed query never
 * costs the other twelve their results.
 */
async function runQuery(
  config: HimalayasConfig,
  term: string,
  deps: SourceDeps
): Promise<{ items: RawItem[]; errors: SourceError[] }> {
  const scope = `${SOURCE_NAME}:${term}`;
  const response = await getJson(searchUrlFor(config, term), scope, deps);
  if (!response.ok) return { items: [], errors: [response.error] };

  // Zero results legitimately omit `jobs` on some responses — absent is empty,
  // not a shape violation.
  const jobs = readArray(response.data, "jobs", scope, true);
  if (!jobs.ok) return { items: [], errors: [jobs.error] };

  const items: RawItem[] = [];
  const errors: SourceError[] = [];

  for (const raw of jobs.items) {
    if (!isRecord(raw)) {
      errors.push({ scope, kind: "shape", detail: `expected a job object, got ${typeof raw}` });
      continue;
    }
    items.push({
      source_type: "job_board",
      source_name: SOURCE_NAME,
      raw_payload: raw,
      url: str(raw, "applicationLink") ?? str(raw, "guid"),
      fetched_at: deps.now(),
    });
  }

  return { items, errors };
}

/** Stable identity for within-run dedupe across the 13 overlapping queries. */
function identity(item: RawItem): string {
  if (item.url !== null) return item.url;
  const payload = item.raw_payload as Record<string, unknown>;
  return `${String(payload.companyName ?? "")}|${String(payload.title ?? "")}`;
}

async function fetchHimalayas(
  config: HimalayasConfig,
  preferences: Preferences,
  deps: SourceDeps
): Promise<FetchResult> {
  const { terms, dropped } = deriveQueryTerms(preferences);
  const errors: SourceError[] = [];

  const capped = cappedTermsError(SOURCE_NAME, dropped);
  if (capped) errors.push(capped);

  const items: RawItem[] = [];
  const seen = new Set<string>();

  // Sequential on purpose: 13 requests to one host, one at a time, is polite
  // by construction and keeps the run's request pattern predictable.
  for (const term of terms) {
    const result = await runQuery(config, term, deps);
    errors.push(...result.errors);
    for (const item of result.items) {
      const key = identity(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  return { items, errors };
}

/**
 * The Himalayas source.
 *
 * @param preferences the operator's CONFIRMED discovery scope, injected via
 *        SourceBuildContext. Required — this source has no meaning without a
 *        scope to search for, and D15 forbids inventing one.
 * @throws {Error} at build time when no confirmed scope was supplied.
 */
export function createHimalayasSource(
  config: HimalayasConfig = HIMALAYAS_CONFIG,
  preferences?: Preferences
): Stage3Source {
  if (!preferences) {
    throw new Error(
      "himalayas needs the operator's confirmed discovery scope (preferences.json). " +
        "Run `oaos setup-scope` and confirm your scope."
    );
  }

  return {
    name: SOURCE_NAME,
    family: "query_net",
    enabled: true,
    fetch: (deps) => fetchHimalayas(config, preferences, deps),

    // ONE probe query, not the full 13 — a health check must not cost as much
    // as the run it is checking. The first enabled scope term is used so the
    // probe exercises the same URL shape a real query does.
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const { terms } = deriveQueryTerms(preferences);
      if (terms.length === 0) {
        return {
          ok: false,
          checkedAt: deps.now(),
          detail: "no enabled fields in preferences.json — nothing to search for",
        };
      }
      const result = await runQuery(config, terms[0], deps);
      const ok = result.errors.length === 0;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok
          ? `ok, probe "${terms[0]}" returned ${result.items.length} jobs`
          : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
