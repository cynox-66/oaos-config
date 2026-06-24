// config.ts
// File: src/engines/application-package/config.ts
// Purpose: Static configuration for the Application Package Engine (Engine 6):
//          the cover-letter word cap, fabrication-check thresholds and keyword
//          lists, and the per-category tone register. All tunables live here.

// ============================================================
// Cover letter
// ============================================================

/** Hard upper bound on cover-letter length (spec: ≤250 words). */
export const MAX_LETTER_WORDS = 250;

/** Number of ranked evidence assets cited as proof points (spec: exactly 2). */
export const PROOF_POINT_COUNT = 2;

// ============================================================
// Fabrication check (GAP B)
// ============================================================

/** A sentence flags when more than this many tokens are unsupported. */
export const FABRICATION_SUSPICIOUS_LIMIT = 3;

/** Tokens must be longer than this to count (length > 2). */
export const MIN_TOKEN_LENGTH = 2;

/** Years-of-experience claims: flagged unless the phrase appears in the base resume. */
export const YEARS_OF_EXPERIENCE_REGEX = /\b\d+\+?\s*(years?|yrs?)\b/i;

/** Seniority/title keywords; flagged when absent from the base resume's titles. */
export const TITLE_KEYWORDS = [
  "staff",
  "principal",
  "senior",
  "lead",
  "manager",
  "director",
  "head",
  "vp",
  "chief",
];

// ============================================================
// Tone register by category (spec Decision Rules)
// ============================================================

/** Tone instruction injected into the cover-letter prompt, keyed by category. */
export const TONE_BY_CATEGORY: Record<string, string> = {
  Startup: "Tone: direct and builder-minded — concrete, action-oriented, no corporate fluff.",
};

/** Tone used for every non-startup category (corporate intern / job / etc.). */
export const DEFAULT_TONE =
  "Tone: structured and credentialed — clear, professional, evidence-led.";
