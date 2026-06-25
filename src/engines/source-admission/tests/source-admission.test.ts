// tests/source-admission.test.ts
// Pure admission checks: all-pass, scrape→probation, individual failures,
// global budget, and remaining-budget math.

import { describe, it, expect } from "vitest";
import { admitSource } from "../source-admission";
import type { AdmittedSource, IngestionType, SourceProposal } from "../types";

function proposal(over: Partial<SourceProposal> = {}): SourceProposal {
  return {
    name: "rss-feed",
    type: "rss" as IngestionType,
    auth_required: false,
    est_volume_per_week: 20,
    est_maint_min_per_week: 5,
    cost_per_month_inr: 0,
    has_health_check: true,
    dedupe_compatible: true,
    survives_format_change: true,
    ...over,
  };
}

describe("all checks pass", () => {
  it("admits with no probation and no failures", () => {
    const d = admitSource(proposal(), []);
    expect(d.admit).toBe(true);
    expect(d.probation).toBe(false);
    expect(d.failed_checks).toEqual([]);
    expect(d.global_budget_remaining_min).toBe(45); // 50 - 0 - 5
  });
});

describe("scrape → probation", () => {
  it("admits a passing scrape source on probation with no failures", () => {
    const d = admitSource(proposal({ type: "scrape" }), []);
    expect(d.admit).toBe(true);
    expect(d.probation).toBe(true);
    expect(d.failed_checks).toEqual([]);
  });

  it("a scrape that fails another check is rejected with only that check (no scrape failure)", () => {
    const d = admitSource(proposal({ type: "scrape", has_health_check: false }), []);
    expect(d.admit).toBe(false);
    expect(d.probation).toBe(false);
    expect(d.failed_checks).toEqual(["health_check: has_health_check is false"]);
  });
});

describe("individual check failures", () => {
  it("cost > 0 with no justification → rejected", () => {
    const d = admitSource(proposal({ cost_per_month_inr: 500 }), []);
    expect(d.admit).toBe(false);
    expect(d.failed_checks.some((c) => c.startsWith("cost"))).toBe(true);
  });

  it("cost > 0 WITH justification → passes the cost check", () => {
    const d = admitSource(proposal({ cost_per_month_inr: 500, justification: "earned 5000 in manual trial" }), []);
    expect(d.failed_checks.some((c) => c.startsWith("cost"))).toBe(false);
    expect(d.admit).toBe(true);
  });

  it("has_health_check=false → rejected", () => {
    const d = admitSource(proposal({ has_health_check: false }), []);
    expect(d.admit).toBe(false);
    expect(d.failed_checks).toContain("health_check: has_health_check is false");
  });

  it("maint > 10 → rejected", () => {
    const d = admitSource(proposal({ est_maint_min_per_week: 11 }), []);
    expect(d.admit).toBe(false);
    expect(d.failed_checks.some((c) => c.startsWith("maint"))).toBe(true);
  });
});

describe("global maintenance budget", () => {
  const admitted: AdmittedSource[] = [
    { name: "a", est_maint_min_per_week: 30, probation: false },
    { name: "b", est_maint_min_per_week: 16, probation: false },
  ]; // 46 used

  it("a proposal that would breach the 50-min budget is rejected", () => {
    const d = admitSource(proposal({ est_maint_min_per_week: 5 }), admitted); // 46 + 5 = 51 > 50
    expect(d.admit).toBe(false);
    expect(d.failed_checks.some((c) => c.startsWith("budget"))).toBe(true);
    // Rejected → remaining excludes the proposal: 50 - 46 = 4.
    expect(d.global_budget_remaining_min).toBe(4);
  });

  it("a proposal that fits is admitted and reduces the remaining budget", () => {
    const d = admitSource(proposal({ est_maint_min_per_week: 4 }), admitted); // 46 + 4 = 50 <= 50
    expect(d.admit).toBe(true);
    expect(d.global_budget_remaining_min).toBe(0); // 50 - 46 - 4
  });
});
