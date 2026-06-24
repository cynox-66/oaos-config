// tests/recommend.test.ts
// Totality, determinism, table order, requires_human_review, pipeline_thin,
// catch-all robustness, and hand-checked spec-table cases for Engine 4.

import { describe, it, expect } from "vitest";
import { recommend } from "../recommend";
import type { Action } from "../types";
import type { Category } from "../../normalization/types";
import type { Tier } from "../../scoring/types";
import { makeRequest } from "./helpers";

const TIERS: Tier[] = ["S", "A", "B", "C"];
const CATEGORIES: Category[] = ["Job", "Internship", "Freelance", "Startup", "OSS", "Other"];
const ACTIONS: Action[] = ["Apply", "Outreach", "Both", "Ignore"];

describe("totality — every tier × category × reachable maps to exactly one action", () => {
  it("covers all 48 combinations with a valid action and no throw", () => {
    let count = 0;
    for (const tier of TIERS) {
      for (const category of CATEGORIES) {
        for (const reachable of [true, false]) {
          const rec = recommend(makeRequest({ tier, category, reachable }));
          expect(ACTIONS, `${tier}/${category}/${reachable}`).toContain(rec.action);
          expect(typeof rec.requires_human_review).toBe("boolean");
          count++;
        }
      }
    }
    expect(count).toBe(48);
  });
});

describe("determinism", () => {
  it("returns the same recommendation across runs", () => {
    for (const tier of TIERS) {
      for (const category of CATEGORIES) {
        for (const reachable of [true, false]) {
          const a = recommend(makeRequest({ tier, category, reachable }));
          const b = recommend(makeRequest({ tier, category, reachable }));
          expect(a).toEqual(b);
        }
      }
    }
  });
});

describe("table order — more-specific rules fire before less-specific", () => {
  it("C + OSS + reachable → Ignore (C rule beats the OSS rule)", () => {
    expect(recommend(makeRequest({ tier: "C", category: "OSS", reachable: true })).action).toBe("Ignore");
  });

  it("pipeline-thin top-of-C → Outreach (thin rule beats C → Ignore)", () => {
    const rec = recommend(
      makeRequest({ tier: "C", category: "Job", reachable: false, total: 47 }),
      { pipeline_thin: true }
    );
    expect(rec.action).toBe("Outreach");
  });

  it("B + OSS + not reachable → Outreach (OSS rule beats B/*/no → Ignore)", () => {
    expect(recommend(makeRequest({ tier: "B", category: "OSS", reachable: false })).action).toBe("Outreach");
  });
});

describe("requires_human_review", () => {
  it("true when confidence < 0.6", () => {
    expect(
      recommend(makeRequest({ tier: "A", category: "Job", reachable: true, confidence: 0.5 }))
        .requires_human_review
    ).toBe(true);
  });

  it("true when tier_uncertain", () => {
    expect(
      recommend(makeRequest({ tier: "A", category: "Job", reachable: true, tier_uncertain: true }))
        .requires_human_review
    ).toBe(true);
  });

  it("true when coverage_gap present, and the reason names the gap", () => {
    const rec = recommend(
      makeRequest({ tier: "A", category: "Job", reachable: true, coverage_gap: "eBPF" })
    );
    expect(rec.requires_human_review).toBe(true);
    expect(rec.reason).toContain("(coverage gap: eBPF)");
  });

  it("false when all three triggers are absent", () => {
    const rec = recommend(
      makeRequest({
        tier: "A",
        category: "Job",
        reachable: true,
        confidence: 0.8,
        tier_uncertain: false,
        coverage_gap: null,
      })
    );
    expect(rec.requires_human_review).toBe(false);
    expect(rec.reason).not.toContain("coverage gap");
  });
});

describe("pipeline_thin mode", () => {
  it("promotes top-of-C (total ≥ 45) from Ignore to Outreach", () => {
    expect(
      recommend(makeRequest({ tier: "C", category: "Job", reachable: true, total: 45 }), {
        pipeline_thin: true,
      }).action
    ).toBe("Outreach");
  });

  it("leaves below-threshold C as Ignore even in thin mode", () => {
    expect(
      recommend(makeRequest({ tier: "C", category: "Job", reachable: true, total: 44 }), {
        pipeline_thin: true,
      }).action
    ).toBe("Ignore");
  });

  it("does not promote C when thin mode is off (default)", () => {
    expect(
      recommend(makeRequest({ tier: "C", category: "Job", reachable: true, total: 90 })).action
    ).toBe("Ignore");
  });
});

describe("catch-all robustness — malformed input returns Ignore, never throws", () => {
  it("empty object → Ignore, no review, no throw", () => {
    // deliberately malformed
    const rec = recommend({} as never);
    expect(rec.action).toBe("Ignore");
    expect(rec.requires_human_review).toBe(false);
  });

  it("unknown tier → Ignore", () => {
    const rec = recommend({ score: { tier: "Z" } } as never);
    expect(rec.action).toBe("Ignore");
  });
});

describe("spec-table spot-checks (hand-verified)", () => {
  const cases: { tier: Tier; category: Category; reachable: boolean; expected: Action }[] = [
    { tier: "C", category: "Job", reachable: true, expected: "Ignore" },
    { tier: "S", category: "OSS", reachable: true, expected: "Outreach" },
    { tier: "A", category: "OSS", reachable: false, expected: "Outreach" },
    { tier: "S", category: "Job", reachable: true, expected: "Both" },
    { tier: "A", category: "Internship", reachable: false, expected: "Apply" },
    { tier: "S", category: "Freelance", reachable: true, expected: "Outreach" },
    { tier: "A", category: "Freelance", reachable: false, expected: "Apply" },
    { tier: "S", category: "Startup", reachable: true, expected: "Both" },
    { tier: "A", category: "Startup", reachable: false, expected: "Outreach" },
    { tier: "B", category: "Job", reachable: true, expected: "Outreach" },
    { tier: "B", category: "Job", reachable: false, expected: "Ignore" },
    { tier: "B", category: "Freelance", reachable: true, expected: "Ignore" }, // catch-all (unlisted)
  ];

  for (const c of cases) {
    it(`${c.tier} / ${c.category} / ${c.reachable ? "reachable" : "not"} → ${c.expected}`, () => {
      expect(recommend(makeRequest(c)).action).toBe(c.expected);
    });
  }
});
