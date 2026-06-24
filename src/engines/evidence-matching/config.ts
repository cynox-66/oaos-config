// config.ts
// File: src/engines/evidence-matching/config.ts
// Purpose: Static configuration for the Evidence Matching Engine (Engine 3):
//          the fit-formula weights, floor, recency decay, coverage threshold,
//          tie-break epsilon and type preferences, and reason/fabrication
//          tuning. All tunables live here.

import type { EvidenceType } from "./types";

// ============================================================
// Fit formula (spec Section 3, Logic step 2)
//   fit = 0.45·tag + 0.30·domain + 0.15·(strength/5) + 0.10·recency
// ============================================================

export const FIT_WEIGHTS = {
  tag: 0.45,
  domain: 0.3,
  strength: 0.15,
  recency: 0.1,
} as const;

/** Never return an asset below this fit (spec floor). */
export const FIT_FLOOR = 0.25;

/** Top-N kept (spec: top 3). */
export const MAX_RESULTS = 3;

// ============================================================
// Recency decay (GAP B): recency_factor = 0.5^(age_months/18), clamped [0,1]
// ============================================================

export const RECENCY_HALFLIFE_MONTHS = 18;

/** Average month length in ms (365.25/12 days). */
export const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

/** Age applied when recency_date is missing/invalid (two half-lives). */
export const MISSING_RECENCY_AGE_MONTHS = 36;

// ============================================================
// Coverage gap (GAP C)
// ============================================================

/** The top required capability is "covered" iff some asset reaches this fit. */
export const COVERAGE_FIT_THRESHOLD = 0.4;

// ============================================================
// Type-preference tie-break (GAP D)
// ============================================================

/** Two fits within this epsilon are treated as a tie. */
export const TIE_EPSILON = 0.001;

/** Preferred evidence types per opportunity classification (ordered). */
export const TYPE_PREFERENCES: Record<string, EvidenceType[]> = {
  "security/eBPF": ["PR", "RFC"],
  freelance: ["Freelance", "Client", "Project"],
  "writing/devrel": ["Article", "Talk"],
};

/** Regex classifying an opportunity as writing/devrel from role text. */
export const WRITING_DEVREL_REGEX =
  /\b(write|writing|devrel|developer relations|advocate)\b/i;

// ============================================================
// LLM reason + fabrication check (GAP F)
// ============================================================

/** Reject a reason when more than this many tokens are unsupported. */
export const FABRICATION_SUSPICIOUS_LIMIT = 3;

/** Tokens must be longer than this to count (spec: length > 2). */
export const MIN_TOKEN_LENGTH = 2;

/** Fallback reason (relevance_blurb) is truncated to this many chars. */
export const FALLBACK_REASON_MAX_CHARS = 120;
