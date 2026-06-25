// config.ts
// File: src/engines/long-term-intelligence/config.ts
// Purpose: Static configuration for the Long-Term Intelligence Engine
//          (Engine 12): the minimum-data gates, weight bounds, and thresholds.

// ============================================================
// Minimum-data gates (suggest nothing below them)
// ============================================================

export const SOURCE_WEIGHTING_MIN_SENT = 20;
export const SOURCE_WEIGHTING_MIN_RESPONSES = 5;
export const SCORING_CALIBRATION_MIN_RESOLVED = 30;
export const EVIDENCE_SIGNAL_MIN_CITATIONS = 15;

// ============================================================
// Source weighting
// ============================================================

/** Default starting weight for every source (no prior weights on the input). */
export const DEFAULT_WEIGHT = 1.0;

/** Per-cycle weight bounds (±20%). */
export const WEIGHT_LOWER_FACTOR = 0.8;
export const WEIGHT_UPPER_FACTOR = 1.2;

// ============================================================
// Scoring calibration (correlation-proxy thresholds)
// ============================================================

/** |proxy| below this → factor not predictive → down-weight (-1). */
export const CALIBRATION_NEAR_ZERO = 0.05;
/** proxy above this → factor predictive → up-weight (+1). */
export const CALIBRATION_STRONG = 0.15;

// ============================================================
// Evidence signal (response-correlation thresholds)
// ============================================================

export const EVIDENCE_KEEP_THRESHOLD = 0.4;
export const EVIDENCE_EXPAND_THRESHOLD = 0.2;
