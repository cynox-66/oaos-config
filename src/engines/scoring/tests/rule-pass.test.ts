// tests/rule-pass.test.ts
// Determinism, rule-pass mappings, inputs_hash composition, and the confidence
// formula. No LLM involved — these assert the deterministic surface only.

import { describe, it, expect } from "vitest";
import {
  computeRulePass,
  computeInputsHash,
  mergeScores,
} from "../score";
import type { Contact, ScoreRequest } from "../types";
import { makeRequest, makeOpportunity, FIXED_NOW } from "./helpers";

describe("computeRulePass — deterministic mappings", () => {
  it("quality.oss maps research.oss_involvement", () => {
    const cases: [string | null, number][] = [
      ["maintains", 10],
      ["contributes", 7],
      ["uses", 5],
      ["none", 0],
      [null, 0],
      ["garbage", 0],
    ];
    for (const [val, expected] of cases) {
      const r = computeRulePass(makeRequest({ research: { oss_involvement: val } }));
      expect(r.quality.oss, `oss=${val}`).toBe(expected);
    }
  });

  it("quality.stage maps research.stage, default 3 for unknown/missing", () => {
    const cases: [string | null | undefined, number][] = [
      ["seed", 10],
      ["series-a", 7],
      ["series-b", 6],
      ["growth", 3],
      ["public", 1],
      ["unknown", 3],
      ["weird", 3],
    ];
    for (const [val, expected] of cases) {
      const r = computeRulePass(makeRequest({ research: { stage: val } }));
      expect(r.quality.stage, `stage=${val}`).toBe(expected);
    }
    // null research → default 3
    expect(computeRulePass(makeRequest({ research: null })).quality.stage).toBe(3);
  });

  it("match.contact maps the best reachability", () => {
    const map: [number, number][] = [
      [5, 10],
      [4, 8],
      [3, 5],
      [2, 3],
      [1, 1],
    ];
    for (const [reach, expected] of map) {
      const contacts: Contact[] = [{ id: "c", reachability: reach, relationship: "Cold" }];
      expect(computeRulePass(makeRequest({ contacts })).match.contact).toBe(expected);
    }
    expect(computeRulePass(makeRequest({ contacts: [] })).match.contact).toBe(0);
  });

  it("match.contact takes the maximum across multiple contacts", () => {
    const contacts: Contact[] = [
      { id: "a", reachability: 2, relationship: "Cold" },
      { id: "b", reachability: 5, relationship: "Cold" },
    ];
    expect(computeRulePass(makeRequest({ contacts })).match.contact).toBe(10);
  });

  it("match.network maps the best contact relationship", () => {
    const map: [Contact["relationship"], number][] = [
      ["Met", 10],
      ["Warm", 8],
      ["GitHub Interaction", 7],
      ["Slack", 5],
      ["Cold", 0],
    ];
    for (const [rel, expected] of map) {
      const contacts: Contact[] = [{ id: "c", reachability: 1, relationship: rel }];
      expect(computeRulePass(makeRequest({ contacts })).match.network).toBe(expected);
    }
    expect(computeRulePass(makeRequest({ contacts: [] })).match.network).toBe(0);
  });

  it("match.evidence = round(top_score*10), capped at 10", () => {
    expect(computeRulePass(makeRequest({ evidence_match: null })).match.evidence).toBe(0);
    expect(computeRulePass(makeRequest({ evidence_match: { id: "e", top_score: 0.0 } })).match.evidence).toBe(0);
    expect(computeRulePass(makeRequest({ evidence_match: { id: "e", top_score: 0.66 } })).match.evidence).toBe(7);
    expect(computeRulePass(makeRequest({ evidence_match: { id: "e", top_score: 1.0 } })).match.evidence).toBe(10);
  });

  it("is fully deterministic across repeated runs", () => {
    const req = makeRequest({
      research: { stage: "seed", oss_involvement: "maintains" },
      contacts: [{ id: "c", reachability: 4, relationship: "Warm" }],
      evidence_match: { id: "e", top_score: 0.7 },
    });
    expect(computeRulePass(req)).toEqual(computeRulePass(req));
  });
});

describe("computeInputsHash (GAPs 2, 3, 4)", () => {
  it("is deterministic and order-independent in contacts", () => {
    const a = makeRequest({
      contacts: [
        { id: "z", reachability: 3, relationship: "Cold" },
        { id: "a", reachability: 3, relationship: "Cold" },
      ],
    });
    const b = makeRequest({
      contacts: [
        { id: "a", reachability: 3, relationship: "Cold" },
        { id: "z", reachability: 3, relationship: "Cold" },
      ],
    });
    expect(computeInputsHash(a)).toBe(computeInputsHash(b));
  });

  it("changes when research changes", () => {
    const base = makeRequest({ research: null });
    const withResearch = makeRequest({ research: { stage: "seed" } });
    expect(computeInputsHash(base)).not.toBe(computeInputsHash(withResearch));
  });

  it("uses evidence_match.id when present, content hash otherwise", () => {
    const withId = makeRequest({ evidence_match: { id: "E123", top_score: 0.5 } });
    const noId = makeRequest({ evidence_match: { top_score: 0.5 } });
    // Different evidence identity → different hash.
    expect(computeInputsHash(withId)).not.toBe(computeInputsHash(noId));
    // Same request hashes identically.
    expect(computeInputsHash(withId)).toBe(computeInputsHash(makeRequest({ evidence_match: { id: "E123", top_score: 0.5 } })));
  });
});

describe("confidence formula (via mergeScores)", () => {
  const rule = { quality: { oss: 0, stage: 0 }, match: { contact: 0, evidence: 0, network: 0 } };
  const merge = (req: ScoreRequest, llmFailed: boolean) =>
    mergeScores(req, rule, llmFailed ? null : { quality_domain: 0, quality_leverage: 0, match_overlap: 0, rationale: "" }, {
      llmFailed,
      now: FIXED_NOW,
    });

  it("0.5·completeness + 0.3·research + 0.2·contacts", () => {
    // completeness 1, research present, contacts present → 1.0
    const full = merge(
      makeRequest({
        opportunity: makeOpportunity({ completeness: 1 }),
        research: { stage: "seed" },
        contacts: [{ id: "c", reachability: 1, relationship: "Cold" }],
      }),
      false
    );
    expect(full.confidence).toBeCloseTo(1.0, 5);

    // completeness 0.5, no research, no contacts → 0.25
    const partial = merge(makeRequest({ opportunity: makeOpportunity({ completeness: 0.5 }) }), false);
    expect(partial.confidence).toBeCloseTo(0.25, 5);

    // completeness 0, research only → 0.3
    const researchOnly = merge(
      makeRequest({ opportunity: makeOpportunity({ completeness: 0 }), research: { stage: "seed" } }),
      false
    );
    expect(researchOnly.confidence).toBeCloseTo(0.3, 5);
  });

  it("is capped at 0.4 when the LLM failed", () => {
    const failed = merge(
      makeRequest({
        opportunity: makeOpportunity({ completeness: 1 }),
        research: { stage: "seed" },
        contacts: [{ id: "c", reachability: 1, relationship: "Cold" }],
      }),
      true
    );
    expect(failed.confidence).toBeLessThanOrEqual(0.4);
  });
});
