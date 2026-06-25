// long-term-intelligence.ts
// File: src/engines/long-term-intelligence/long-term-intelligence.ts
// Purpose: The pure Long-Term Intelligence Engine (Engine 12). Produces bounded,
//          gated SUGGESTIONS only — `applied` is always the literal false; a
//          human must accept before anything changes. Deterministic.

import type { OutcomeType, Score } from "./types";
import type {
  CalibrationSuggestion,
  DataGateStatus,
  EvidenceSignalItem,
  IntelligenceRequest,
  IntelligenceUpdate,
  ScoredOutcome,
  SourceWeightSuggestion,
} from "./types";
import {
  CALIBRATION_NEAR_ZERO,
  CALIBRATION_STRONG,
  DEFAULT_WEIGHT,
  EVIDENCE_EXPAND_THRESHOLD,
  EVIDENCE_KEEP_THRESHOLD,
  EVIDENCE_SIGNAL_MIN_CITATIONS,
  SCORING_CALIBRATION_MIN_RESOLVED,
  SOURCE_WEIGHTING_MIN_RESPONSES,
  SOURCE_WEIGHTING_MIN_SENT,
  WEIGHT_LOWER_FACTOR,
  WEIGHT_UPPER_FACTOR,
} from "./config";

/** The eight scoring factors, with accessors into a {@link Score}. */
const FACTORS: { name: string; get: (s: Score) => number }[] = [
  { name: "domain", get: (s) => s.quality.domain },
  { name: "oss", get: (s) => s.quality.oss },
  { name: "leverage", get: (s) => s.quality.leverage },
  { name: "stage", get: (s) => s.quality.stage },
  { name: "overlap", get: (s) => s.match.overlap },
  { name: "evidence", get: (s) => s.match.evidence },
  { name: "contact", get: (s) => s.match.contact },
  { name: "network", get: (s) => s.match.network },
];

/** A ScoredOutcome counts as "responded" when its outcome reached ≥ response. */
function responseReceived(outcome: OutcomeType): boolean {
  return outcome === "response" || outcome === "interview" || outcome === "offer" || outcome === "income";
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function sourceWeightSuggestions(request: IntelligenceRequest): SourceWeightSuggestion[] {
  const ratesWithSent = request.sourceReports
    .filter((s) => s.sent >= 1)
    .map((s) => s.responses / s.sent);
  const meanRate = mean(ratesWithSent);

  return request.sourceReports
    .filter((s) => s.sent >= SOURCE_WEIGHTING_MIN_SENT && s.responses >= SOURCE_WEIGHTING_MIN_RESPONSES)
    .map((s) => {
      const rate = s.responses / s.sent;
      const deviation = meanRate !== 0 ? (rate - meanRate) / meanRate : 0;
      const suggested = clamp(
        DEFAULT_WEIGHT * (1 + deviation),
        DEFAULT_WEIGHT * WEIGHT_LOWER_FACTOR,
        DEFAULT_WEIGHT * WEIGHT_UPPER_FACTOR
      );
      return {
        source_name: s.source_name,
        current_weight: DEFAULT_WEIGHT,
        suggested_weight: suggested,
        basis: `response rate ${rate.toFixed(3)} vs mean ${meanRate.toFixed(3)} (deviation ${(deviation * 100).toFixed(0)}%)`,
        low_confidence_signal: s.low_confidence,
      };
    });
}

function calibrationSuggestions(scoreHistory: ScoredOutcome[]): CalibrationSuggestion[] {
  const responded = scoreHistory.filter((o) => responseReceived(o.outcome));
  const notResponded = scoreHistory.filter((o) => !responseReceived(o.outcome));

  const out: CalibrationSuggestion[] = [];
  for (const factor of FACTORS) {
    const proxy =
      mean(responded.map((o) => factor.get(o.score))) -
      mean(notResponded.map((o) => factor.get(o.score)));

    let adjustment: number | null = null;
    let observation = "";
    if (Math.abs(proxy) < CALIBRATION_NEAR_ZERO) {
      adjustment = -1;
      observation = `near-zero correlation with response (proxy ${proxy.toFixed(3)})`;
    } else if (proxy > CALIBRATION_STRONG) {
      adjustment = +1;
      observation = `positive correlation with response (proxy ${proxy.toFixed(3)})`;
    }
    if (adjustment !== null) {
      out.push({ factor: factor.name, observation, suggested_adjustment: adjustment, bounded: true });
    }
  }
  return out;
}

function evidenceSignals(request: IntelligenceRequest): EvidenceSignalItem[] {
  const byId = new Map<string, { total: number; withResponse: number }>();
  for (const c of request.evidenceCitations) {
    const agg = byId.get(c.evidence_id) ?? { total: 0, withResponse: 0 };
    agg.total += 1;
    if (c.response_received) agg.withResponse += 1;
    byId.set(c.evidence_id, agg);
  }

  return [...byId.keys()]
    .sort()
    .map((evidence_id) => {
      const { total, withResponse } = byId.get(evidence_id)!;
      const corr = total > 0 ? withResponse / total : 0;
      const recommendation =
        corr >= EVIDENCE_KEEP_THRESHOLD ? "keep" : corr >= EVIDENCE_EXPAND_THRESHOLD ? "expand" : "retire";
      return { evidence_id, response_correlation: corr, recommendation };
    });
}

/**
 * Produce bounded, gated intelligence suggestions from accumulated outcomes.
 * Each suggestion type is emitted only when its minimum-data gate is met. All
 * outputs are suggestions: `applied` is always `false`.
 *
 * @param request score history + source reports + attribution rollup + evidence
 *        citations.
 */
export function computeIntelligence(request: IntelligenceRequest): IntelligenceUpdate {
  const data_gates: DataGateStatus = {
    source_weighting_met: request.sourceReports.some(
      (s) => s.sent >= SOURCE_WEIGHTING_MIN_SENT && s.responses >= SOURCE_WEIGHTING_MIN_RESPONSES
    ),
    scoring_calibration_met: request.scoreHistory.length >= SCORING_CALIBRATION_MIN_RESOLVED,
    evidence_signal_met: request.evidenceCitations.length >= EVIDENCE_SIGNAL_MIN_CITATIONS,
  };

  return {
    source_weight_suggestions: data_gates.source_weighting_met ? sourceWeightSuggestions(request) : [],
    scoring_calibration: data_gates.scoring_calibration_met
      ? calibrationSuggestions(request.scoreHistory)
      : [],
    evidence_signal: data_gates.evidence_signal_met ? evidenceSignals(request) : [],
    // No computation rule in the spec — reserved for a future extension.
    source_proposals: [],
    // ALWAYS false — these are suggestions; a human must accept them.
    applied: false,
    data_gates,
  };
}
