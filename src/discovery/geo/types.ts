// types.ts
// File: src/discovery/geo/types.ts
// Purpose: Types for the geo-eligibility mapping module (G1, 2026-08-06).
//          The module maps each source's OWN geo vocabulary onto the
//          operator's confirmed GeoPreference (source-agnostic dimension,
//          Amendment B). Pure data types only.

/**
 * The outcome classes, and the rule that keeps them honest:
 *
 * - `eligible` / `ineligible` — a mapper ran and resolved the posting's geo
 *   against the operator's eligible countries (membership tests only, never
 *   length heuristics — the Hostaway rule).
 * - `unresolved` — a mapper RAN and could not parse the value. Governed by
 *   `GeoPreference.unresolved` ("pass" | "gate").
 * - `unknown_source` — NO mapper exists for this source. ALWAYS passes the
 *   filter, reported separately and loudly (operator ruling Q2, 2026-08-06);
 *   the `unresolved` policy does not govern it. The two are different
 *   failures: one is a parse gap inside a known vocabulary, the other is a
 *   source whose eligibility semantics were never mapped at all.
 */
export type GeoStatus = "eligible" | "ineligible" | "unresolved" | "unknown_source";

/** The mapped geo signal for one item. */
export interface GeoSignal {
  status: GeoStatus;
  /**
   * The ISO-3166 alpha-2 codes the posting's geo resolved to (may be empty —
   * e.g. an explicitly-worldwide posting, or unknown_source). Diagnostic;
   * `status` alone drives the filter.
   */
  countries: string[];
  /** The raw source value the mapping read, for run-summary diagnostics. */
  raw: string;
}
