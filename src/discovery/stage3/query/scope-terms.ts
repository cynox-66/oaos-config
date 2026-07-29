// scope-terms.ts
// File: src/discovery/stage3/query/scope-terms.ts
// Purpose: Turn the operator's CONFIRMED discovery scope (preferences.json,
//          Wave 1 / D15) into the query terms a query_net source searches for.
//          Pure — takes an already-loaded Preferences, never touches disk.
//
// This is the ONLY place a Preferences becomes a list of search terms. Each
// source then shapes those terms into its own request (Adzuna appends
// " remote", freehire pairs them with work_mode=remote, Himalayas passes them
// as `q`) — per-source query strategy is the Wave 5 architectural decision, so
// this module deliberately stops at "which terms", never "which URL".
//
// ── The query cap (Wave 5 Q3 ruling) ────────────────────────────────────────
// One HTTP request per term per source per run. The operator's confirmed scope
// has 13 fields today, but nothing stops a future scope carrying 40 custom
// terms, which would silently turn one run into 120+ requests. MAX_QUERY_TERMS
// is the ceiling; terms beyond it are DROPPED AND REPORTED as a SourceError,
// never silently truncated. A source that quietly searched two-thirds of the
// operator's scope would be lying about its coverage.

import type { Preferences } from "../../scope/types";
import type { SourceError } from "../types";

/**
 * Hard ceiling on query terms per source per run. Sized just above the
 * operator's confirmed 13 fields so normal scope growth is absorbed, and low
 * enough that a runaway scope cannot turn one run into hundreds of requests.
 */
export const MAX_QUERY_TERMS = 15;

export interface QueryTerms {
  /** The terms to search, in preferences order, capped at MAX_QUERY_TERMS. */
  terms: string[];
  /**
   * Terms dropped by the cap. Non-empty here MUST become a reported
   * SourceError — see {@link cappedTermsError}.
   */
  dropped: string[];
}

/**
 * Derive search terms from a confirmed scope: the ENABLED fields, lowercased
 * and trimmed, empties dropped, duplicates collapsed, order preserved.
 *
 * Mirrors `preferencesToVocabulary`'s normalization deliberately — the terms a
 * source SEARCHES for and the terms prerank SCORES with should not drift apart.
 *
 * @param preferences an already-loaded, already-validated confirmed scope.
 * @param max ceiling override; defaults to {@link MAX_QUERY_TERMS}.
 */
export function deriveQueryTerms(preferences: Preferences, max: number = MAX_QUERY_TERMS): QueryTerms {
  const seen = new Set<string>();
  const all: string[] = [];

  for (const field of preferences.fields) {
    if (!field.enabled) continue;
    const term = field.name.toLowerCase().trim();
    if (term === "" || seen.has(term)) continue;
    seen.add(term);
    all.push(term);
  }

  return { terms: all.slice(0, max), dropped: all.slice(max) };
}

/**
 * The SourceError a source must report when the cap dropped terms. Returns
 * null when nothing was dropped, so call sites can spread it unconditionally.
 */
export function cappedTermsError(scope: string, dropped: string[], max: number = MAX_QUERY_TERMS): SourceError | null {
  if (dropped.length === 0) return null;
  return {
    scope,
    kind: "shape",
    detail:
      `query cap: searched the first ${max} scope terms, dropped ${dropped.length} ` +
      `(${dropped.join(", ")}). This source did NOT cover your full discovery scope this run.`,
  };
}
