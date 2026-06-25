// config.ts
// File: src/engines/follow-up/config.ts
// Purpose: Static configuration for the Follow-Up Engine (Engine 8): the
//          schedule offsets, per-step word caps, and the follow-up-specific
//          banned phrases (which EXTEND Engine 7's list — imported, not copied).

import { BANNED_PHRASES as OUTREACH_BANNED_PHRASES } from "../outreach-package/config";

// ============================================================
// Schedule (spec: FU1 = sent+4d, FU2 = sent+10d, FU3 = sent+17d)
// ============================================================

/** Days after sent_date that each follow-up (by FU number) is due. */
export const DUE_DAYS_BY_FU: Record<number, number> = {
  1: 4,
  2: 10,
  3: 17,
};

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** The highest follow-up number; never exceeded (hard cap). */
export const MAX_FOLLOWUPS = 3;

// ============================================================
// Per-step word caps (spec: FU1 ≤60, FU2 ≤50, FU3 ≤40)
// ============================================================

export const WORD_CAP_BY_FU: Record<number, number> = {
  1: 60,
  2: 50,
  3: 40,
};

// ============================================================
// Banned phrases — Engine 7's list EXTENDED with follow-up-specific phrases.
// ============================================================

/** Follow-up-specific banned phrases (added on top of Engine 7's list). */
export const FOLLOWUP_BANNED_PHRASES: string[] = [
  "just following up",
  "bumping this",
  "i know you're busy",
  "no worries if not",
  "totally understand if you're swamped",
  "hope this finds you well",
  "did you get a chance",
  "per my last",
];

/** Combined banned-phrase list for follow-ups (Engine 7 + follow-up-specific). */
export const BANNED_PHRASES: string[] = [
  ...OUTREACH_BANNED_PHRASES,
  ...FOLLOWUP_BANNED_PHRASES.filter((p) => !OUTREACH_BANNED_PHRASES.includes(p)),
];

// ============================================================
// Generation
// ============================================================

/** Max Gemini calls per draft: one generation + at most one regeneration. */
export const MAX_GEMINI_CALLS = 2;
