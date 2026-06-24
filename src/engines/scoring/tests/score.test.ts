// tests/score.test.ts
// Two-pass orchestration: monotonicity, clamping, LLM failure/degrade, the
// stricter retry, idempotency, tier_uncertain boundaries, the leverage cap, and
// calibration (no catastrophic inversions).

import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Contact, ResearchStage, Score } from "../types";
import { makeRequest, makeOpportunity, jsonClient, countingClient, FIXED_NOW } from "./helpers";
import { CALIBRATION_FIXTURES } from "./calibration";

const opts = (client: ReturnType<typeof jsonClient>, previous?: Score | null) => ({
  client,
  now: FIXED_NOW,
  previous: previous ?? null,
});

describe("monotonicity — improving any single factor never lowers total", () => {
  const fixedLLM = jsonClient({ quality_domain: 8, quality_leverage: 8, match_overlap: 10 });

  async function totalFor(over: Parameters<typeof makeRequest>[0]) {
    return (await computeScore(makeRequest(over), opts(fixedLLM))).total;
  }

  it("rising reachability does not lower total", async () => {
    let prev = -1;
    for (const reachability of [1, 2, 3, 4, 5]) {
      const contacts: Contact[] = [{ id: "c", reachability, relationship: "Cold" }];
      const total = await totalFor({ contacts });
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it("rising evidence top_score does not lower total", async () => {
    let prev = -1;
    for (const top_score of [0, 0.25, 0.5, 0.75, 1]) {
      const total = await totalFor({ evidence_match: { id: "e", top_score } });
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it("rising stage value does not lower total", async () => {
    let prev = -1;
    const ascending: ResearchStage[] = ["public", "growth", "series-b", "series-a", "seed"];
    for (const stage of ascending) {
      const total = await totalFor({ research: { stage } });
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it("rising LLM domain does not lower total", async () => {
    let prev = -1;
    for (const quality_domain of [0, 5, 10, 15]) {
      const client = jsonClient({ quality_domain, quality_leverage: 8, match_overlap: 10 });
      const total = (await computeScore(makeRequest(), opts(client))).total;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });
});

describe("clamping — out-of-range LLM integers are clamped to factor max", () => {
  it("clamps domain/leverage/overlap to their maxima", async () => {
    const client = jsonClient({ quality_domain: 99, quality_leverage: 50, match_overlap: 99 });
    const score = await computeScore(makeRequest(), opts(client));
    expect(score.quality.domain).toBe(15);
    expect(score.quality.leverage).toBe(15);
    expect(score.match.overlap).toBe(20);
  });

  it("clamps negative values up to 0", async () => {
    const client = jsonClient({ quality_domain: -5, quality_leverage: -1, match_overlap: -3 });
    const score = await computeScore(makeRequest(), opts(client));
    expect(score.quality.domain).toBe(0);
    expect(score.quality.leverage).toBe(0);
    expect(score.match.overlap).toBe(0);
  });
});

describe("LLM failure handling", () => {
  it("retries once on malformed JSON, then degrades to rule-pass-only", async () => {
    const { client, state } = countingClient(() => "this is not json at all");
    const score = await computeScore(makeRequest({ research: { stage: "seed" } }), {
      client,
      now: FIXED_NOW,
    });
    expect(state.calls).toBe(2); // initial + one retry
    expect(score.confidence).toBeLessThanOrEqual(0.4);
    expect(score.rationale).toBe("LLM scoring unavailable");
    // Judgment factors fall back to 0; rule factors still present.
    expect(score.quality.domain).toBe(0);
    expect(score.quality.leverage).toBe(0);
    expect(score.match.overlap).toBe(0);
    expect(score.quality.stage).toBe(10); // seed, from the rule pass
  });

  it("uses the retry result when the first response is malformed but the second is valid", async () => {
    const { client, state } = countingClient((call) =>
      call === 1 ? "garbage" : JSON.stringify({ quality_domain: 12, quality_leverage: 9, match_overlap: 14, rationale: "ok" })
    );
    const score = await computeScore(makeRequest(), { client, now: FIXED_NOW });
    expect(state.calls).toBe(2);
    expect(score.quality.domain).toBe(12);
    expect(score.rationale).toBe("ok");
  });

  it("a parseable object missing a field defaults that field to 0 (no degrade)", async () => {
    const { client, state } = countingClient(() => JSON.stringify({ quality_domain: 11, rationale: "partial" }));
    const score = await computeScore(makeRequest(), { client, now: FIXED_NOW });
    expect(state.calls).toBe(1); // parseable → no retry
    expect(score.quality.domain).toBe(11);
    expect(score.quality.leverage).toBe(0);
    expect(score.match.overlap).toBe(0);
  });
});

describe("idempotency — same inputs_hash short-circuits without an LLM call", () => {
  it("returns the previous score and never calls Gemini", async () => {
    const valid = jsonClient({ quality_domain: 10, quality_leverage: 10, match_overlap: 10 });
    const req = makeRequest({ research: { stage: "seed" } });
    const previous = await computeScore(req, opts(valid));

    const { client, state } = countingClient(() => "should not be called");
    const again = await computeScore(req, { client, now: FIXED_NOW, previous });

    expect(state.calls).toBe(0);
    expect(again).toBe(previous);
  });

  it("does NOT short-circuit when inputs changed (hash mismatch)", async () => {
    const valid = jsonClient({ quality_domain: 10, quality_leverage: 10, match_overlap: 10 });
    const previous = await computeScore(makeRequest({ research: { stage: "seed" } }), opts(valid));

    const { client, state } = countingClient(() =>
      JSON.stringify({ quality_domain: 1, quality_leverage: 1, match_overlap: 1, rationale: "x" })
    );
    const changed = makeRequest({ research: { stage: "public" } }); // different hash
    await computeScore(changed, { client, now: FIXED_NOW, previous });
    expect(state.calls).toBeGreaterThan(0);
  });
});

describe("tier_uncertain — within 2 of a boundary AND confidence < 0.6", () => {
  // completeness 0 + research + contacts → confidence 0.5 (< 0.6).
  const lowConf = () =>
    makeRequest({
      opportunity: makeOpportunity({ completeness: 0 }),
      research: { stage: "seed", oss_involvement: "maintains" },
      contacts: [{ id: "c", reachability: 5, relationship: "GitHub Interaction" }],
      evidence_match: { id: "e", top_score: 0.9 },
    });

  it("flags uncertainty at total 84 (2 below the S boundary) with low confidence", async () => {
    // rule: oss10 stage10 contact10 evidence9 network7 = 46; llm domain15 + lev9 + ovl14 = 38 → 84
    const client = jsonClient({ quality_domain: 15, quality_leverage: 9, match_overlap: 14 });
    const score = await computeScore(lowConf(), opts(client));
    expect(score.total).toBe(84);
    expect(score.confidence).toBeLessThan(0.6);
    expect(score.tier_uncertain).toBe(true);
  });

  it("does NOT flag at total 82 (3 below the boundary)", async () => {
    const client = jsonClient({ quality_domain: 15, quality_leverage: 7, match_overlap: 14 });
    const score = await computeScore(lowConf(), opts(client));
    expect(score.total).toBe(82);
    expect(score.tier_uncertain).toBe(false);
  });

  it("does NOT flag near a boundary when confidence is high", async () => {
    // completeness 1 → confidence ≥ 0.6 even near boundary.
    const req = makeRequest({
      opportunity: makeOpportunity({ completeness: 1 }),
      research: { stage: "seed", oss_involvement: "maintains" },
      contacts: [{ id: "c", reachability: 5, relationship: "GitHub Interaction" }],
      evidence_match: { id: "e", top_score: 0.9 },
    });
    const client = jsonClient({ quality_domain: 15, quality_leverage: 9, match_overlap: 14 });
    const score = await computeScore(req, opts(client));
    expect(score.total).toBe(84);
    expect(score.confidence).toBeGreaterThanOrEqual(0.6);
    expect(score.tier_uncertain).toBe(false);
  });
});

describe("equity / unpaid leverage cap (GAP 10)", () => {
  it("caps leverage at 8 for equity-only non-OSS and notes it", async () => {
    const req = makeRequest({
      opportunity: makeOpportunity({ category: "Startup", comp_basis: "equity" }),
    });
    const client = jsonClient({ quality_domain: 10, quality_leverage: 15, match_overlap: 10 });
    const score = await computeScore(req, opts(client));
    expect(score.quality.leverage).toBe(8);
    expect(score.rationale).toContain("leverage capped: equity-only non-OSS");
  });

  it("caps leverage at 5 for unpaid non-OSS", async () => {
    const req = makeRequest({
      opportunity: makeOpportunity({ category: "Job", comp_basis: "unpaid" }),
    });
    const client = jsonClient({ quality_domain: 10, quality_leverage: 15, match_overlap: 10 });
    const score = await computeScore(req, opts(client));
    expect(score.quality.leverage).toBe(5);
    expect(score.rationale).toContain("leverage capped: unpaid non-OSS");
  });

  it("does NOT cap leverage for OSS even when unpaid", async () => {
    const req = makeRequest({
      opportunity: makeOpportunity({ category: "OSS", comp_basis: "unpaid" }),
    });
    const client = jsonClient({ quality_domain: 10, quality_leverage: 15, match_overlap: 10 });
    const score = await computeScore(req, opts(client));
    expect(score.quality.leverage).toBe(15);
    expect(score.rationale).not.toContain("capped");
  });
});

describe("calibration fixtures (≥10) — tiers and no catastrophic inversions", () => {
  it("has at least 10 fixtures", () => {
    expect(CALIBRATION_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it("computes the expected tier and never assigns S to a C-labeled case", async () => {
    let agree = 0;
    for (const fx of CALIBRATION_FIXTURES) {
      const score = await computeScore(fx.request, opts(jsonClient(fx.llm)));
      if (score.tier === fx.expectedTier) agree++;
      if (fx.expectedTier === "C") {
        expect(score.tier, `${fx.name} must not invert to S`).not.toBe("S");
      }
    }
    // Deterministic by construction → full agreement (spec floor is 80%).
    expect(agree / CALIBRATION_FIXTURES.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe("output shape", () => {
  it("produces a well-formed Score", async () => {
    const client = jsonClient({ quality_domain: 12, quality_leverage: 10, match_overlap: 14 });
    const score = await computeScore(
      makeRequest({
        research: { stage: "seed", oss_involvement: "maintains" },
        contacts: [{ id: "c", reachability: 4, relationship: "Warm" }],
        evidence_match: { id: "e", top_score: 0.7 },
      }),
      opts(client)
    );
    expect(score.quality.total).toBe(score.quality.domain + score.quality.oss + score.quality.leverage + score.quality.stage);
    expect(score.match.total).toBe(score.match.overlap + score.match.evidence + score.match.contact + score.match.network);
    expect(score.total).toBe(score.quality.total + score.match.total);
    expect(["S", "A", "B", "C"]).toContain(score.tier);
    expect(score.scored_at).toBe(FIXED_NOW);
    expect(score.inputs_hash).toMatch(/^[a-f0-9]{40}$/);
  });
});
