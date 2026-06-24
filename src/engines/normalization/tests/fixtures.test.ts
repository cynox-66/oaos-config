// tests/fixtures.test.ts
// Labeled-fixture accuracy: category and ≥1 domain must match the label for
// ≥90% of hand-written fixtures, per adapter. Also asserts schema validity.

import { describe, it, expect } from "vitest";
import { normalize } from "../normalize";
import { validateOpportunity } from "./schema";
import { MANUAL_FIXTURES, type LabeledFixture } from "./fixtures/manual";
import { JOB_BOARD_FIXTURES } from "./fixtures/job_board";

function runAccuracy(fixtures: LabeledFixture[]) {
  let categoryHits = 0;
  let domainHits = 0;
  const misses: string[] = [];

  for (const fx of fixtures) {
    const opp = normalize(fx.raw);

    // Every output must validate against the schema.
    expect(validateOpportunity(opp), `${fx.name} schema`).toEqual([]);

    const categoryOk = opp.category === fx.expected.category;
    const domainOk = fx.expected.domains.some((d) => opp.domain.includes(d));

    if (categoryOk) categoryHits++;
    if (domainOk) domainHits++;
    if (!categoryOk) misses.push(`${fx.name}: category ${opp.category} != ${fx.expected.category}`);
    if (!domainOk) misses.push(`${fx.name}: domains [${opp.domain}] missing one of [${fx.expected.domains}]`);
  }

  return {
    categoryRate: categoryHits / fixtures.length,
    domainRate: domainHits / fixtures.length,
    misses,
  };
}

describe("manual adapter — labeled fixtures", () => {
  it("has at least 10 fixtures", () => {
    expect(MANUAL_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it("matches expected category and ≥1 domain for ≥90%", () => {
    const { categoryRate, domainRate, misses } = runAccuracy(MANUAL_FIXTURES);
    expect(categoryRate, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.9);
    expect(domainRate, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.9);
  });
});

describe("job_board adapter — labeled fixtures", () => {
  it("has at least 10 fixtures", () => {
    expect(JOB_BOARD_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it("matches expected category and ≥1 domain for ≥90%", () => {
    const { categoryRate, domainRate, misses } = runAccuracy(JOB_BOARD_FIXTURES);
    expect(categoryRate, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.9);
    expect(domainRate, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.9);
  });
});
