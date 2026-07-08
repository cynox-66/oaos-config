// types.ts
// File: src/discovery/stage2/types.ts
// Purpose: Type definitions for Stage 2 discovery (email-alert parsing). This
//          layer is source-specific ONLY at the parser boundary; every parser
//          emits canonical RawItems that flow through Engine 1 (normalize) and
//          the pipeline unchanged — no engine or adapter is modified.

/**
 * A known alert/listing email format. Each value has a dedicated parser under
 * `parsers/` and a detection heuristic in `parse.ts` (documented per file).
 * Priority order (income-relevance first): job boards / remote boards /
 * freelance are first-class, not an afterthought.
 */
export type AlertSource =
  | "linkedin" // LinkedIn Jobs digest
  | "indeed" // Indeed job alert
  | "wellfound" // Wellfound / AngelList startup jobs
  | "weworkremotely" // We Work Remotely (remote board)
  | "upwork" // Upwork saved-search (freelance)
  | "remoteok"; // Remote OK (remote board)

/**
 * A single listing extracted from an alert, before it is packaged into a
 * {@link RawItem}. All fields are best-effort: any may be null when the source
 * format did not carry it. Engine 1's completeness / needs_enrichment mechanism
 * handles partial data downstream — parsers do NOT over-extract.
 */
export interface ParsedListing {
  company: string | null;
  role: string | null;
  /** Canonical listing URL (becomes RawItem.url). */
  url: string | null;
  location: string | null;
  /** Raw compensation text, if the alert showed one (parsed by Engine 1). */
  comp: string | null;
  /** Free-text description/snippet (role + surrounding lines). */
  description: string | null;
}
