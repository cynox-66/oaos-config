// adzuna.ts
// File: src/discovery/stage3/sources/adzuna.ts
// Purpose: Adzuna India query_net source — one tight role+remote search per
//          enabled scope field. CONTENT-QUARANTINED: Adzuna truncates every
//          description to exactly 500 characters, so this source is a
//          discovery/dedup signal and can never be a content source.
//
// ── Live-confirmed API shape (2026-07-28) ───────────────────────────────────
//   GET https://api.adzuna.com/v1/api/jobs/in/search/1
//       ?app_id&app_key&results_per_page=20
//       &what=<term>%20remote&sort_by=date&max_days_old=14
//   → 200 {results[], count, mean}
//   what="devops remote" → count 11, 11 results.
//   what="kubernetes remote" → count 0, results [] (clean empty, not an error).
//
// ── WHY " remote" IS APPENDED TO EVERY QUERY ────────────────────────────────
// A bare domain keyword is noise on this endpoint. Phase 0c measured
// `what=kubernetes` at 10,326 India matches dominated by postings that mention
// Kubernetes in passing — an "Assistant Professor", a "Sales Engineering Lead".
// The same probe with a role plus "remote" returned 59, all genuine. The scope
// terms are DOMAINS ("Kubernetes", "Security"), so " remote" is the tightener
// that makes them usable. This is query construction, not relevance filtering:
// the adapter still transports everything the API returns.
//
// ── what_all + what_or was TRIED and REJECTED BY THE API ────────────────────
// Combining them would collapse 13 requests into 1. Live-verified 2026-07-28:
// `what_all=remote&what_or=<terms>` returns HTTP 400 with a generic HTML error
// page and no machine-readable reason. Per the bounded-verification policy it
// was recorded and not probed further. Do not re-attempt without budget.
//
// ── THE 500-CHAR TRUNCATION ─────────────────────────────────────────────────
// All 11 sampled descriptions were EXACTLY 500 characters, cutting mid-sentence
// and ending in "…". This is deliberate on Adzuna's side (drive traffic to
// their site), not an artifact. Quarantined per query/truncation.ts, so
// `description_raw` comes out empty and no engine can mistake half a posting
// for the posting. Honest consequence, stated once here: acting on an Adzuna
// item requires the operator to open `redirect_url`. Engine 1's research step
// does NOT backfill this — it fetches a COMPANY profile, not the posting body.

import type { RawItem } from "../../../engines/normalization/types";
import type { Preferences } from "../../scope/types";
import type { FetchResult, HealthCheckResult, SourceDeps, SourceError, Stage3Source } from "../types";
import { getJson, isRecord, readArray, str } from "../query/http-json";
import { cappedTermsError, deriveQueryTerms } from "../query/scope-terms";
import { queryTermWithSeniority } from "../query/seniority-modifier";
import { quarantineContent } from "../query/truncation";

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

export interface AdzunaConfig {
  /** Base without the trailing page number. */
  baseUrl: string;
  /** ISO country slice of the Adzuna API. */
  country: string;
  resultsPerPage: number;
  /** Freshness window; keeps a daily run from re-reading the same archive. */
  maxDaysOld: number;
}

export const ADZUNA_CONFIG: AdzunaConfig = {
  baseUrl: "https://api.adzuna.com/v1/api/jobs",
  country: "in",
  resultsPerPage: 20,
  maxDaysOld: 14,
};

const SOURCE_NAME = "adzuna";

/**
 * The seniority modifier decorates `what`, which ALREADY carries the
 * load-bearing " remote". With the modifier confirmed this becomes a 3-clause
 * query ("<term> remote entry level") — the tightest of the three query_net
 * sources and the one most likely to collapse to zero results. It still sends
 * exactly one request per scope term.
 */
function searchUrlFor(
  config: AdzunaConfig,
  credentials: AdzunaCredentials,
  term: string,
  preferences: Preferences
): string {
  const params = new URLSearchParams({
    app_id: credentials.appId,
    app_key: credentials.appKey,
    results_per_page: String(config.resultsPerPage),
    what: queryTermWithSeniority(`${term} remote`, preferences),
    sort_by: "date",
    max_days_old: String(config.maxDaysOld),
  });
  // Page 1 only — the Wave 5 one-page cap. Tight queries returned 0-11 results
  // live, so a second page would almost always be an empty request.
  return `${config.baseUrl}/${config.country}/search/1?${params.toString()}`;
}

/** Adzuna nests company and location one level down. */
function nestedDisplayName(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  return isRecord(value) ? str(value, "display_name") : null;
}

/**
 * Adzuna reports salary as two numbers; Engine 1 parses a free-text `salary`
 * string. Rendering the pair is field mapping, not estimation — and
 * `salary_is_predicted` is left in `source_record` so a predicted figure stays
 * distinguishable from an employer-stated one.
 */
function salaryText(raw: Record<string, unknown>): string | null {
  const min = typeof raw.salary_min === "number" ? raw.salary_min : null;
  const max = typeof raw.salary_max === "number" ? raw.salary_max : null;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return min === max ? String(min) : `${min} - ${max}`;
  return String(min ?? max);
}

function toRawItem(raw: Record<string, unknown>, deps: SourceDeps): RawItem {
  const description = typeof raw.description === "string" ? raw.description : "";

  // No `remote` key is lifted. We query for "remote" but Adzuna does not
  // confirm it as a field, and asserting an arrangement the source never
  // stated would be classification, not transport. Engine 1 resolves it to
  // "unknown"; prerank's location gate is conservative and lets it through.
  const payload = quarantineContent(
    {
      title: str(raw, "title") ?? "",
      company: nestedDisplayName(raw, "company") ?? "",
      location: nestedDisplayName(raw, "location"),
      salary: salaryText(raw),
      job_type: str(raw, "contract_time"),
    },
    description,
    "adzuna:search-api-500char",
    raw
  );

  return {
    source_type: "job_board",
    source_name: SOURCE_NAME,
    raw_payload: payload,
    url: str(raw, "redirect_url"),
    fetched_at: deps.now(),
  };
}

async function runQuery(
  config: AdzunaConfig,
  credentials: AdzunaCredentials,
  term: string,
  preferences: Preferences,
  deps: SourceDeps
): Promise<{ items: RawItem[]; errors: SourceError[] }> {
  const scope = `${SOURCE_NAME}:${term}`;
  const response = await getJson(searchUrlFor(config, credentials, term, preferences), scope, deps);
  if (!response.ok) return { items: [], errors: [response.error] };

  const rows = readArray(response.data, "results", scope, true);
  if (!rows.ok) return { items: [], errors: [rows.error] };

  const items: RawItem[] = [];
  const errors: SourceError[] = [];

  for (const raw of rows.items) {
    if (!isRecord(raw)) {
      errors.push({ scope, kind: "shape", detail: `expected a result object, got ${typeof raw}` });
      continue;
    }
    items.push(toRawItem(raw, deps));
  }

  return { items, errors };
}

function identity(item: RawItem): string {
  if (item.url !== null) return item.url;
  const payload = item.raw_payload as Record<string, unknown>;
  return `${String(payload.company ?? "")}|${String(payload.title ?? "")}`;
}

async function fetchAdzuna(
  config: AdzunaConfig,
  credentials: AdzunaCredentials,
  preferences: Preferences,
  deps: SourceDeps
): Promise<FetchResult> {
  const { terms, dropped } = deriveQueryTerms(preferences);
  const errors: SourceError[] = [];

  const capped = cappedTermsError(SOURCE_NAME, dropped);
  if (capped) errors.push(capped);

  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const result = await runQuery(config, credentials, term, preferences, deps);
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
 * The Adzuna India source.
 *
 * Missing credentials are a RESULT, not a throw: the source builds, reports a
 * clear error from fetch and healthCheck, and the rest of the run proceeds.
 * That is deliberate — a missing env var should not read like a broken source.
 *
 * @param credentials from `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`, injected via
 *        SourceBuildContext. Never read from disk by this module.
 * @throws {Error} at build time when no confirmed scope was supplied.
 */
export function createAdzunaSource(
  config: AdzunaConfig = ADZUNA_CONFIG,
  preferences?: Preferences,
  credentials?: AdzunaCredentials
): Stage3Source {
  if (!preferences) {
    throw new Error(
      "adzuna needs the operator's confirmed discovery scope (preferences.json). " +
        "Run `oaos setup-scope` and confirm your scope."
    );
  }

  const missingCredentials: SourceError = {
    scope: SOURCE_NAME,
    kind: "http",
    detail:
      "no Adzuna credentials — set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env. " +
      "The source made no request.",
  };

  return {
    name: SOURCE_NAME,
    family: "query_net",
    enabled: true,

    fetch: async (deps) =>
      credentials ? fetchAdzuna(config, credentials, preferences, deps) : { items: [], errors: [missingCredentials] },

    healthCheck: async (deps): Promise<HealthCheckResult> => {
      if (!credentials) {
        return { ok: false, checkedAt: deps.now(), detail: missingCredentials.detail };
      }
      const { terms } = deriveQueryTerms(preferences);
      if (terms.length === 0) {
        return {
          ok: false,
          checkedAt: deps.now(),
          detail: "no enabled fields in preferences.json — nothing to search for",
        };
      }
      const result = await runQuery(config, credentials, terms[0], preferences, deps);
      const ok = result.errors.length === 0;
      return {
        ok,
        checkedAt: deps.now(),
        // A clean probe returning 0 results is HEALTHY, not broken — tight
        // India+remote queries legitimately return 0 (live-confirmed).
        detail: ok
          ? `ok, probe "${terms[0]} remote" returned ${result.items.length} results`
          : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
