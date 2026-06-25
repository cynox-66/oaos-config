// tests/source-performance.test.ts
// Pure aggregation: funnel counts, null rates, low_confidence, originating-
// source attribution, ranking, and the income sum-check.

import { describe, it, expect } from "vitest";
import { computeSourcePerformance } from "../source-performance";
import type { OutcomeEvent, OutcomeType } from "../types";

let seq = 0;
function ev(
  type: OutcomeType,
  opportunity_id: string,
  source_name: string,
  amount_inr?: number
): OutcomeEvent {
  // Distinct, increasing dates by creation order keep "first chronological" stable.
  const date = new Date(2026, 0, 1, 0, 0, seq++);
  return amount_inr !== undefined
    ? { type, opportunity_id, source_name, date, amount_inr, kind: "freelance" }
    : { type, opportunity_id, source_name, date };
}

function sentN(opp: string, source: string, n: number): OutcomeEvent[] {
  return Array.from({ length: n }, () => ev("sent", opp, source));
}

function find(reports: ReturnType<typeof computeSourcePerformance>, name: string) {
  return reports.find((r) => r.source_name === name)!;
}

describe("funnel aggregation", () => {
  it("counts each funnel stage per source", () => {
    const events = [
      ev("discovered", "o1", "wellfound"),
      ev("qualified", "o1", "wellfound"),
      ...sentN("o1", "wellfound", 3),
      ev("response", "o1", "wellfound"),
      ev("interview", "o1", "wellfound"),
      ev("offer", "o1", "wellfound"),
      ev("income", "o1", "wellfound", 100000),
    ];
    const r = find(computeSourcePerformance(events), "wellfound");
    expect(r.discovered).toBe(1);
    expect(r.qualified).toBe(1);
    expect(r.sent).toBe(3);
    expect(r.responses).toBe(1);
    expect(r.interviews).toBe(1);
    expect(r.offers).toBe(1);
    expect(r.income_total).toBe(100000);
    expect(r.rates.qualify).toBe(1);
    expect(r.rates.response).toBeCloseTo(1 / 3, 6);
  });
});

describe("null rates and low_confidence", () => {
  it("response rate is null (not 0) when sent = 0", () => {
    const events = [ev("discovered", "o1", "untapped"), ev("qualified", "o1", "untapped")];
    const r = find(computeSourcePerformance(events), "untapped");
    expect(r.sent).toBe(0);
    expect(r.rates.response).toBeNull();
    expect(r.rates.qualify).toBe(1);
  });

  it("low_confidence is true when sent < 10, false at >= 10", () => {
    const small = find(computeSourcePerformance(sentN("o1", "small", 9)), "small");
    expect(small.low_confidence).toBe(true);
    const big = find(computeSourcePerformance(sentN("o2", "big", 10)), "big");
    expect(big.low_confidence).toBe(false);
  });
});

describe("originating-source attribution", () => {
  it("attributes every event to the discovered-event source", () => {
    const events = [
      ev("discovered", "o1", "wellfound"),
      ev("response", "o1", "linkedin"), // different source on the event
      ev("income", "o1", "twitter", 50000), // different again
    ];
    const reports = computeSourcePerformance(events);
    const wf = find(reports, "wellfound");
    expect(wf.responses).toBe(1);
    expect(wf.income_total).toBe(50000);
    // linkedin / twitter never appear as their own source.
    expect(reports.find((r) => r.source_name === "linkedin")).toBeUndefined();
    expect(reports.find((r) => r.source_name === "twitter")).toBeUndefined();
  });

  it("falls back to the first chronological event when there is no discovered event", () => {
    const events = [
      ev("sent", "o2", "hn"), // first event, no discovered
      ev("income", "o2", "elsewhere", 30000),
    ];
    const reports = computeSourcePerformance(events);
    expect(find(reports, "hn").income_total).toBe(30000);
    expect(reports.find((r) => r.source_name === "elsewhere")).toBeUndefined();
  });
});

describe("ranking", () => {
  it("confident sources rank first (income desc, response desc); low_confidence trail", () => {
    const events = [
      // confident A: 10 sent, income 200000
      ev("discovered", "a1", "A"),
      ...sentN("a1", "A", 10),
      ev("response", "a1", "A"),
      ev("income", "a1", "A", 200000),
      // confident B: 10 sent, income 100000
      ev("discovered", "b1", "B"),
      ...sentN("b1", "B", 10),
      ev("response", "b1", "B"),
      ev("income", "b1", "B", 100000),
      // low_confidence C: 2 sent, income 999999 (high, but unconfident → trails)
      ev("discovered", "c1", "C"),
      ...sentN("c1", "C", 2),
      ev("income", "c1", "C", 999999),
    ];
    const order = computeSourcePerformance(events).map((r) => r.source_name);
    expect(order).toEqual(["A", "B", "C"]);
  });
});

describe("income sum-check (validation)", () => {
  it("Σ income_total across sources == Σ income event amounts", () => {
    const events = [
      ev("discovered", "o1", "A"),
      ev("income", "o1", "A", 100000),
      ev("discovered", "o2", "B"),
      ev("income", "o2", "B", 250000),
      ev("income", "o2", "B", 75000), // recurring
    ];
    const reports = computeSourcePerformance(events);
    const totalReported = reports.reduce((s, r) => s + r.income_total, 0);
    const totalEvents = events
      .filter((e) => e.type === "income")
      .reduce((s, e) => s + (e.amount_inr ?? 0), 0);
    expect(totalReported).toBe(totalEvents);
    expect(totalReported).toBe(425000);
  });
});
