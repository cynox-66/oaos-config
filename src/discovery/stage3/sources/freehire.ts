// freehire.ts
// File: src/discovery/stage3/sources/freehire.ts
// Purpose: freehire.dev query_net source — one search per enabled scope field,
//          filtered to remote work at the API. CONTENT-QUARANTINED: its
//          descriptions are capped, so they never present as usable content.
//
// ── Live-confirmed API shape (2026-07-28) ───────────────────────────────────
//   GET https://freehire.dev/api/v1/jobs/search
//       ?q=<term>&work_mode=remote&limit=20&offset=0
//   → 200 {data[], meta:{limit,offset,total}}
//   `limit` IS honoured here (unlike Himalayas): limit=3 → 3, limit=100 → 100.
//
// ── PLURAL PARAMS ARE LOAD-BEARING ──────────────────────────────────────────
// `regions` / `countries`, never the singular `region` / `country`. Phase 0
// verified live that the singular forms filter NOTHING — `region=apac`
// returned byte-identical results to no param at all. Re-confirmed this wave:
// `countries=in` cut a query's total from 5,266 to 132 and every one of 100
// returned rows carried "in". If you add a geo param here, use the plural.
//
// ── Why NO country filter is applied ────────────────────────────────────────
// The scope is remote-only WORLDWIDE (D15's `remote_only: true`), and Phase 0
// measured India at ~3.4% of this corpus. Filtering to `countries=in` would
// discard the large majority of in-scope remote work. Geography is the
// operator's decision at review time, not this adapter's.
//
// ── THE ~1000-CHAR CAP (discovered 2026-07-28, not in the Phase 0 record) ───
// Across 100 sampled rows: min 956, median 995, max 1002 chars, 100%
// non-empty, and — unlike Adzuna — NO "…" or any other truncation marker.
// Phase 0 measured description PRESENCE and never measured LENGTH, which is
// how this went unrecorded for a week. Silent truncation is the more dangerous
// kind: it reads as a whole posting right up until it matters. Hence the same
// quarantine Adzuna gets, under a distinct content_source so the two remain
// distinguishable downstream. See query/truncation.ts for the mechanism.

import type { RawItem } from "../../../engines/normalization/types";
import type { Preferences } from "../../scope/types";
import type { FetchResult, HealthCheckResult, SourceDeps, SourceError, Stage3Source } from "../types";
import { getJson, isRecord, readArray, str } from "../query/http-json";
import { cappedTermsError, deriveQueryTerms } from "../query/scope-terms";
import { queryTermWithSeniority } from "../query/seniority-modifier";
import { quarantineContent } from "../query/truncation";

export interface FreehireConfig {
  searchUrl: string;
  /** Rows per query. One page only — the Wave 5 cap. */
  limit: number;
}

export const FREEHIRE_CONFIG: FreehireConfig = {
  searchUrl: "https://freehire.dev/api/v1/jobs/search",
  limit: 20,
};

const SOURCE_NAME = "freehire";

/**
 * The seniority modifier decorates `q`; it never adds a query. One request per
 * scope term either way — see query/seniority-modifier.ts.
 */
function searchUrlFor(config: FreehireConfig, term: string, preferences: Preferences): string {
  const params = new URLSearchParams({
    q: queryTermWithSeniority(term, preferences),
    work_mode: "remote",
    limit: String(config.limit),
    offset: "0",
  });
  return `${config.searchUrl}?${params.toString()}`;
}

/**
 * Build one quarantined RawItem.
 *
 * Company/title/location are LIFTED to the top level because Engine 1's
 * fingerprint is sha1(company|role|url-host) — a payload with no readable
 * company or role collapses every posting onto one fingerprint, which is
 * exactly the NLnet dedupe pathology from Wave 6. `work_mode` is passed
 * through verbatim as `remote`: that is the API's own value for a filter we
 * actually applied, not a classification this adapter invented.
 */
function toRawItem(raw: Record<string, unknown>, deps: SourceDeps): RawItem {
  const description = typeof raw.description === "string" ? raw.description : "";
  const payload = quarantineContent(
    {
      title: str(raw, "title") ?? "",
      company: str(raw, "company") ?? "",
      location: str(raw, "location"),
      remote: str(raw, "work_mode"),
    },
    description,
    "freehire:search-api-1k-cap",
    raw
  );

  return {
    source_type: "job_board",
    source_name: SOURCE_NAME,
    raw_payload: payload,
    url: str(raw, "url"),
    fetched_at: deps.now(),
  };
}

async function runQuery(
  config: FreehireConfig,
  term: string,
  preferences: Preferences,
  deps: SourceDeps
): Promise<{ items: RawItem[]; errors: SourceError[] }> {
  const scope = `${SOURCE_NAME}:${term}`;
  const response = await getJson(searchUrlFor(config, term, preferences), scope, deps);
  if (!response.ok) return { items: [], errors: [response.error] };

  const rows = readArray(response.data, "data", scope, true);
  if (!rows.ok) return { items: [], errors: [rows.error] };

  const items: RawItem[] = [];
  const errors: SourceError[] = [];

  for (const raw of rows.items) {
    if (!isRecord(raw)) {
      errors.push({ scope, kind: "shape", detail: `expected a job object, got ${typeof raw}` });
      continue;
    }
    items.push(toRawItem(raw, deps));
  }

  return { items, errors };
}

/** Stable identity for within-run dedupe across overlapping queries. */
function identity(item: RawItem): string {
  if (item.url !== null) return item.url;
  const payload = item.raw_payload as Record<string, unknown>;
  return `${String(payload.company ?? "")}|${String(payload.title ?? "")}`;
}

async function fetchFreehire(
  config: FreehireConfig,
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
    const result = await runQuery(config, term, preferences, deps);
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
 * The freehire.dev source.
 *
 * @param preferences the operator's CONFIRMED discovery scope, injected via
 *        SourceBuildContext.
 * @throws {Error} at build time when no confirmed scope was supplied.
 */
export function createFreehireSource(
  config: FreehireConfig = FREEHIRE_CONFIG,
  preferences?: Preferences
): Stage3Source {
  if (!preferences) {
    throw new Error(
      "freehire needs the operator's confirmed discovery scope (preferences.json). " +
        "Run `oaos setup-scope` and confirm your scope."
    );
  }

  return {
    name: SOURCE_NAME,
    family: "query_net",
    enabled: true,
    fetch: (deps) => fetchFreehire(config, preferences, deps),

    // One probe query, not all 13 — see himalayas.ts for the reasoning.
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const { terms } = deriveQueryTerms(preferences);
      if (terms.length === 0) {
        return {
          ok: false,
          checkedAt: deps.now(),
          detail: "no enabled fields in preferences.json — nothing to search for",
        };
      }
      const result = await runQuery(config, terms[0], preferences, deps);
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
