// seniority-modifier.ts
// File: src/discovery/stage3/query/seniority-modifier.ts
// Purpose: The ONE place a seniority modifier is composed into a query_net
//          source's query string. Pure — takes an already-loaded Preferences,
//          never touches disk, builds no URL.
//
// ── Where this sits, and why that placement is load-bearing ─────────────────
// This runs INSIDE each source's `searchUrlFor`, strictly downstream of
// `deriveQueryTerms`. It changes the CONTENT of a query string and never the
// NUMBER of them. That is what keeps the Wave 5 Q3 caps intact by construction:
//
//   - `terms.length` is untouched  ⇒ requests per source per run unchanged
//   - MAX_QUERY_TERMS (15) is evaluated against `terms` only ⇒ cannot be
//     breached from here
//   - `dropped` is computed before this is ever called ⇒ the drop-and-report
//     SourceError path is unchanged and still never silent
//   - one page per query is a property of each source's fixed pagination
//     params, which this does not read or write
//
// If a future change makes the modifier add a TERM rather than decorate one,
// every line above stops being true. Don't.
//
// ── Precedent ───────────────────────────────────────────────────────────────
// Adzuna already appends a load-bearing " remote" at exactly this layer (see
// sources/adzuna.ts). This is the same operation, from confirmed scope.
//
// ── Applies to ──────────────────────────────────────────────────────────────
//   himalayas, freehire  — free-text `q`
//   adzuna               — free-text `what`, already carrying " remote", so a
//                          modifier makes it a 3-clause query: the highest
//                          collapse risk of the three
// NOT remotive  — the API has no query parameter at all; only `category`.
// NOT hn-hiring — scope drives its PREFILTER, not its two fixed requests, and
//                 the prefilter is an OR, so a modifier would WIDEN it.
// NOT any company_board source (greenhouse / lever / workday / ashby) — they
//                 fetch a whole board and send no query at all.

import { entryLevelModifier } from "../../scope/seniority";
import type { Preferences } from "../../scope/types";

/**
 * One scope term as it should appear in a query string, with the operator's
 * confirmed entry-level modifier applied.
 *
 * Returns `term` unchanged when the modifier is not confirmed — the default,
 * and the state in which every query_net source behaves exactly as it did
 * before this wave.
 */
export function queryTermWithSeniority(term: string, preferences: Preferences): string {
  const modifier = entryLevelModifier(preferences.seniority);
  if (modifier === null) return term;

  const base = term.trim();
  if (base === "") return modifier;
  // Idempotent: a term that already carries the modifier is not decorated
  // twice. Cheap insurance against a future caller applying this at two layers.
  if (new RegExp(`(^|\\s)${modifier.replace(/\s+/g, "\\s+")}$`, "i").test(base)) return base;

  return `${base} ${modifier}`;
}
