// types.ts
// File: src/engines/long-term-intelligence/types.ts
// Purpose: Type definitions for the Long-Term Intelligence Engine (Engine 12).
//          Mirrors docs/engine-specs.md Section 12 + STEP 2. Reuses Score/Tier
//          (Engine 2), SourceReport/OutcomeType (Engine 9), AttributionRollup
//          (Engine 10).

import type { Score, Tier } from "../scoring/types";
import type { OutcomeType, SourceReport } from "../source-performance/types";
import type { AttributionRollup } from "../income-attribution/types";

export type { Score, Tier, OutcomeType, SourceReport, AttributionRollup };

// ============================================================
// Inputs
// ============================================================

/** A scored opportunity with its resolved outcome. */
export interface ScoredOutcome {
  opportunity_id: string;
  score: Score;
  tier: Tier;
  outcome: OutcomeType;
  source_name: string;
}

/** One evidence citation and whether the outreach got a response. */
export interface EvidenceCitation {
  evidence_id: string;
  opportunity_id: string;
  response_received: boolean;
}

/** Full input to {@link computeIntelligence}. */
export interface IntelligenceRequest {
  scoreHistory: ScoredOutcome[];
  sourceReports: SourceReport[];
  attributionRollup: AttributionRollup[];
  evidenceCitations: EvidenceCitation[];
}

// ============================================================
// Outputs
// ============================================================

/** A bounded per-source weight adjustment suggestion. */
export interface SourceWeightSuggestion {
  source_name: string;
  current_weight: number;
  suggested_weight: number;
  basis: string;
  low_confidence_signal: boolean;
}

/** A bounded scoring-factor calibration suggestion. */
export interface CalibrationSuggestion {
  factor: string;
  observation: string;
  /** −1 (down-weight) or +1 (up-weight). */
  suggested_adjustment: number;
  /** Always true (max ±1 per cycle). */
  bounded: boolean;
}

/** An evidence-asset signal with a retain/expand/retire recommendation. */
export interface EvidenceSignalItem {
  evidence_id: string;
  response_correlation: number;
  recommendation: "keep" | "expand" | "retire";
}

/** Which minimum-data gates were met. */
export interface DataGateStatus {
  source_weighting_met: boolean;
  scoring_calibration_met: boolean;
  evidence_signal_met: boolean;
}

/**
 * The intelligence update. `applied` is the literal `false` — these are
 * suggestions; a human must explicitly accept them. Never auto-applied.
 */
export interface IntelligenceUpdate {
  source_weight_suggestions: SourceWeightSuggestion[];
  scoring_calibration: CalibrationSuggestion[];
  evidence_signal: EvidenceSignalItem[];
  source_proposals: string[];
  applied: false;
  data_gates: DataGateStatus;
}
