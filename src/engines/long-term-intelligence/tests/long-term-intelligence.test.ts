// tests/long-term-intelligence.test.ts
// Pure intelligence: applied is literally false, data gates, bounded weight +
// calibration suggestions, and evidence-signal thresholds.

import { describe, it, expect } from "vitest";
import { computeIntelligence } from "../long-term-intelligence";
import type { EvidenceCitation, IntelligenceRequest, ScoredOutcome } from "../types";
import type { Score, Tier } from "../../scoring/types";
import type { OutcomeType, SourceReport } from "../../source-performance/types";

type FactorMap = Partial<
  Record<"domain" | "oss" | "leverage" | "stage" | "overlap" | "evidence" | "contact" | "network", number>
>;

function makeScore(f: FactorMap = {}): Score {
  return {
    quality: { domain: f.domain ?? 0, oss: f.oss ?? 0, leverage: f.leverage ?? 0, stage: f.stage ?? 0, total: 0 },
    match: { overlap: f.overlap ?? 0, evidence: f.evidence ?? 0, contact: f.contact ?? 0, network: f.network ?? 0, total: 0 },
    total: 0,
    tier: "C" as Tier,
    confidence: 0.8,
    rationale: "",
    scored_at: "",
    inputs_hash: "",
    tier_uncertain: false,
  };
}

function makeSourceReport(over: Partial<SourceReport> & { source_name: string }): SourceReport {
  const sent = over.sent ?? 0;
  const responses = over.responses ?? 0;
  return {
    source_name: over.source_name,
    discovered: 0,
    qualified: 0,
    sent,
    responses,
    interviews: 0,
    offers: 0,
    income_total: over.income_total ?? 0,
    rates: { qualify: null, response: sent > 0 ? responses / sent : null, interview: null, offer: null },
    sample_size: sent,
    low_confidence: over.low_confidence ?? sent < 10,
  };
}

function outcome(o: OutcomeType, f: FactorMap, source = "A"): ScoredOutcome {
  return { opportunity_id: `op_${Math.random()}`, score: makeScore(f), tier: "C", outcome: o, source_name: source };
}

function emptyRequest(over: Partial<IntelligenceRequest> = {}): IntelligenceRequest {
  return { scoreHistory: [], sourceReports: [], attributionRollup: [], evidenceCitations: [], ...over };
}

describe("applied is always false", () => {
  it("returns the literal false (type-level + runtime)", () => {
    const result = computeIntelligence(emptyRequest());
    const _applied: false = result.applied; // compile-time guarantee
    expect(_applied).toBe(false);
    expect(result.source_proposals).toEqual([]);
  });
});

describe("data gates", () => {
  it("below all gates → every suggestion array empty, gates false", () => {
    const result = computeIntelligence(emptyRequest());
    expect(result.source_weight_suggestions).toEqual([]);
    expect(result.scoring_calibration).toEqual([]);
    expect(result.evidence_signal).toEqual([]);
    expect(result.data_gates).toEqual({
      source_weighting_met: false,
      scoring_calibration_met: false,
      evidence_signal_met: false,
    });
  });
});

describe("source weight suggestions (bounded ±20%)", () => {
  it("clamps a high-rate source to +20% and emits only gate-meeting sources", () => {
    const reports = [
      makeSourceReport({ source_name: "A", sent: 20, responses: 10 }), // rate 0.5, meets gate
      makeSourceReport({ source_name: "B", sent: 20, responses: 1 }), // rate 0.05, fails responses>=5 gate
    ];
    const result = computeIntelligence(emptyRequest({ sourceReports: reports }));
    expect(result.data_gates.source_weighting_met).toBe(true);
    expect(result.source_weight_suggestions.map((s) => s.source_name)).toEqual(["A"]);
    const a = result.source_weight_suggestions[0];
    expect(a.suggested_weight).toBeLessThanOrEqual(1.2);
    expect(a.suggested_weight).toBeGreaterThanOrEqual(0.8);
    expect(a.suggested_weight).toBeCloseTo(1.2, 6); // high deviation → clamped to upper bound
    expect(a.current_weight).toBe(1.0);
  });

  it("propagates low_confidence_signal from the source report", () => {
    const reports = [makeSourceReport({ source_name: "A", sent: 20, responses: 5, low_confidence: true })];
    const result = computeIntelligence(emptyRequest({ sourceReports: reports }));
    expect(result.source_weight_suggestions[0].low_confidence_signal).toBe(true);
  });
});

describe("scoring calibration (bounded ±1)", () => {
  it("emits only triggered factors, each adjusted by exactly ±1", () => {
    // 30 outcomes: 15 responded (domain=15, oss=0), 15 not (domain=0, oss=0).
    const responded = Array.from({ length: 15 }, () => outcome("response", { domain: 15, oss: 0 }));
    const notResponded = Array.from({ length: 15 }, () => outcome("sent", { domain: 0, oss: 0 }));
    const result = computeIntelligence(emptyRequest({ scoreHistory: [...responded, ...notResponded] }));
    expect(result.data_gates.scoring_calibration_met).toBe(true);

    const byFactor = Object.fromEntries(result.scoring_calibration.map((c) => [c.factor, c]));
    // domain: proxy 15 (> 0.15) → +1
    expect(byFactor.domain.suggested_adjustment).toBe(1);
    // oss: proxy 0 (|.|<0.05) → -1
    expect(byFactor.oss.suggested_adjustment).toBe(-1);
    for (const c of result.scoring_calibration) {
      expect([1, -1]).toContain(c.suggested_adjustment);
      expect(c.bounded).toBe(true);
    }
  });

  it("does not emit calibration below the 30-outcome gate", () => {
    const few = Array.from({ length: 10 }, () => outcome("response", { domain: 15 }));
    const result = computeIntelligence(emptyRequest({ scoreHistory: few }));
    expect(result.data_gates.scoring_calibration_met).toBe(false);
    expect(result.scoring_calibration).toEqual([]);
  });
});

describe("evidence signal (thresholds 0.4 / 0.2)", () => {
  it("computes response_correlation and maps keep/expand/retire", () => {
    const cite = (evidence_id: string, response_received: boolean): EvidenceCitation => ({
      evidence_id,
      opportunity_id: "o",
      response_received,
    });
    const citations: EvidenceCitation[] = [
      // keep: 3/5 = 0.6
      ...Array.from({ length: 3 }, () => cite("e_keep", true)),
      ...Array.from({ length: 2 }, () => cite("e_keep", false)),
      // expand: 1/5 = 0.2
      cite("e_expand", true),
      ...Array.from({ length: 4 }, () => cite("e_expand", false)),
      // retire: 0/5 = 0.0
      ...Array.from({ length: 5 }, () => cite("e_retire", false)),
    ]; // 15 total → gate met
    const result = computeIntelligence(emptyRequest({ evidenceCitations: citations }));
    expect(result.data_gates.evidence_signal_met).toBe(true);
    const byId = Object.fromEntries(result.evidence_signal.map((e) => [e.evidence_id, e]));
    expect(byId.e_keep.response_correlation).toBeCloseTo(0.6, 6);
    expect(byId.e_keep.recommendation).toBe("keep");
    expect(byId.e_expand.response_correlation).toBeCloseTo(0.2, 6);
    expect(byId.e_expand.recommendation).toBe("expand");
    expect(byId.e_retire.recommendation).toBe("retire");
  });
});
