// config.ts
// File: src/engines/scoring/config.ts
// Purpose: Static configuration for the Opportunity Scoring Engine (Engine 2):
//          tier thresholds, per-factor max values, confidence weights, and the
//          deterministic rule-pass mapping tables. All tunables live here.

import type { ContactRelationship, OssInvolvement, ResearchStage } from "./types";

// ============================================================
// Tier thresholds (spec: S≥85, A≥70, B≥50, else C)
// ============================================================

export const TIER_THRESHOLDS = { S: 85, A: 70, B: 50 } as const;

/** Tier boundaries used for the `tier_uncertain` proximity check. */
export const TIER_BOUNDARIES: number[] = [
  TIER_THRESHOLDS.S,
  TIER_THRESHOLDS.A,
  TIER_THRESHOLDS.B,
];

/** total within this margin of a boundary AND confidence below the cap → uncertain. */
export const TIER_UNCERTAIN_MARGIN = 2;
export const TIER_UNCERTAIN_CONFIDENCE_MAX = 0.6;

// ============================================================
// Per-factor max values (for clamping). Mirror scoring/rubric.md.
// ============================================================

export const FACTOR_MAX = {
  quality: { domain: 15, oss: 10, leverage: 15, stage: 10, total: 50 },
  match: { overlap: 20, evidence: 10, contact: 10, network: 10, total: 50 },
} as const;

// ============================================================
// Confidence (spec: 0.5·completeness + 0.3·(research?1:0) + 0.2·(contacts>0?1:0))
// ============================================================

export const CONFIDENCE_WEIGHTS = {
  completeness: 0.5,
  research: 0.3,
  contacts: 0.2,
} as const;

/** On LLM double-failure, confidence is capped at this value (spec ≤0.4). */
export const LLM_FALLBACK_CONFIDENCE_CAP = 0.4;

// ============================================================
// Rule-pass mapping tables (deterministic)
// ============================================================

/** quality.stage from research.stage. Default (unknown / missing) → 3. */
export const STAGE_SCORES: Record<ResearchStage, number> = {
  seed: 10,
  "series-a": 7,
  "series-b": 6,
  growth: 3,
  public: 1,
  unknown: 3,
};
export const STAGE_DEFAULT = 3;

/** quality.oss from research.oss_involvement. Default (null/unknown) → 0. */
export const OSS_INVOLVEMENT_SCORES: Record<OssInvolvement, number> = {
  maintains: 10,
  contributes: 7,
  uses: 5,
  none: 0,
};
export const OSS_DEFAULT = 0;

/** match.network from the best contact's relationship. Default / empty → 0. */
export const RELATIONSHIP_SCORES: Record<ContactRelationship, number> = {
  Met: 10,
  Warm: 8,
  "GitHub Interaction": 7,
  Slack: 5,
  Cold: 0,
};
export const RELATIONSHIP_DEFAULT = 0;

/** match.contact from the best contact's reachability (1..5). Default → 0. */
export const REACHABILITY_SCORES: Record<number, number> = {
  5: 10,
  4: 8,
  3: 5,
  2: 3,
  1: 1,
};
export const REACHABILITY_DEFAULT = 0;

// ============================================================
// Equity / unpaid leverage caps (spec Decision Rules; GAP 10)
// ============================================================

export const EQUITY_LEVERAGE_CAP = 8;
export const UNPAID_LEVERAGE_CAP = 5;

// ============================================================
// Gemini
// ============================================================

export const GEMINI_MODEL = "gemini-3.5-flash";
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
