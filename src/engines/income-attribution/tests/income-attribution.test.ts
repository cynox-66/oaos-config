// tests/income-attribution.test.ts
// Pure attribution: first/last touch, recurring income, refunds, rollups, and
// the income sum-check.

import { describe, it, expect } from "vitest";
import { computeAttribution } from "../income-attribution";
import type { OutreachLogEntry } from "../types";
import type { OutcomeEvent } from "../../source-performance/types";

const d = (n: number) => new Date(2026, 0, n);

const events: OutcomeEvent[] = [
  { type: "discovered", opportunity_id: "o1", source_name: "wellfound", date: d(1) },
  { type: "income", opportunity_id: "o1", source_name: "ignored", date: d(20), amount_inr: 100000, kind: "salary" },
];

const log: OutreachLogEntry[] = [
  { opportunity_id: "o1", channel: "email", date: d(5) },
  { opportunity_id: "o1", channel: "linkedin_dm", date: d(12) },
  { opportunity_id: "o1", channel: "slack", date: d(25) }, // after income → ignored
];

describe("first-touch source", () => {
  it("uses the discovered-event source, not the income event's own source", () => {
    const { records } = computeAttribution(events, log);
    expect(records).toHaveLength(1);
    expect(records[0].first_touch_source).toBe("wellfound");
    expect(records[0].source_name).toBe("wellfound");
  });
});

describe("last-touch channel", () => {
  it("is the latest outreach on or before recognized_date", () => {
    const { records } = computeAttribution(events, log);
    expect(records[0].last_touch_channel).toBe("linkedin_dm"); // d(12), not d(25)
  });

  it("is null when there is no outreach on or before the income date", () => {
    const { records } = computeAttribution(events, [
      { opportunity_id: "o1", channel: "email", date: d(25) },
    ]);
    expect(records[0].last_touch_channel).toBeNull();
  });
});

describe("recurring income", () => {
  it("produces one record per income event for the same opportunity", () => {
    const recurring: OutcomeEvent[] = [
      { type: "discovered", opportunity_id: "o1", source_name: "upwork", date: d(1) },
      { type: "income", opportunity_id: "o1", source_name: "upwork", date: d(10), amount_inr: 50000, kind: "freelance" },
      { type: "income", opportunity_id: "o1", source_name: "upwork", date: d(40), amount_inr: 50000, kind: "freelance" },
    ];
    const { records, rollup } = computeAttribution(recurring, []);
    expect(records).toHaveLength(2);
    expect(rollup).toHaveLength(1);
    expect(rollup[0].total_inr).toBe(100000);
    expect(rollup[0].count).toBe(2);
  });
});

describe("refund / clawback", () => {
  it("a negative amount creates a negative record and reduces the rollup", () => {
    const withRefund: OutcomeEvent[] = [
      { type: "discovered", opportunity_id: "o1", source_name: "upwork", date: d(1) },
      { type: "income", opportunity_id: "o1", source_name: "upwork", date: d(10), amount_inr: 100000, kind: "freelance" },
      { type: "income", opportunity_id: "o1", source_name: "upwork", date: d(20), amount_inr: -30000, kind: "freelance" },
    ];
    const { rollup } = computeAttribution(withRefund, []);
    expect(rollup[0].total_inr).toBe(70000);
    expect(rollup[0].count).toBe(2);
    expect(rollup[0].avg_inr).toBe(35000); // 70000 / 2, negatives included
  });
});

describe("income sum-check (validation)", () => {
  it("Σ record amounts == Σ income event amounts", () => {
    const mixed: OutcomeEvent[] = [
      { type: "discovered", opportunity_id: "o1", source_name: "A", date: d(1) },
      { type: "income", opportunity_id: "o1", source_name: "A", date: d(5), amount_inr: 120000, kind: "salary" },
      { type: "discovered", opportunity_id: "o2", source_name: "B", date: d(2) },
      { type: "income", opportunity_id: "o2", source_name: "B", date: d(6), amount_inr: 80000, kind: "bounty" },
      { type: "income", opportunity_id: "o2", source_name: "B", date: d(9), amount_inr: -20000, kind: "bounty" },
    ];
    const { records, rollup } = computeAttribution(mixed, []);
    const recordSum = records.reduce((s, r) => s + r.amount_inr, 0);
    const eventSum = mixed.filter((e) => e.type === "income").reduce((s, e) => s + (e.amount_inr ?? 0), 0);
    expect(recordSum).toBe(eventSum);
    const rollupSum = rollup.reduce((s, r) => s + r.total_inr, 0);
    expect(rollupSum).toBe(eventSum);
  });
});
