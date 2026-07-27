// registry.test.ts
// File: src/discovery/stage3/tests/registry.test.ts

import { describe, expect, it } from "vitest";
import { COMPANY_REGISTRY, PLATFORM_SOURCE_META } from "../registry";
import { buildSourceProposal } from "../admission";
import { admitSource } from "../../../engines/source-admission";
import type { AdmittedSource } from "../../../engines/source-admission";

const PLATFORMS_WITH_ADAPTERS = ["greenhouse", "lever", "workday", "ashby"];

describe("COMPANY_REGISTRY", () => {
  it("has exactly 8 locked entries", () => {
    expect(COMPANY_REGISTRY).toHaveLength(8);
  });

  it("has a matching adapter for every entry's platform", () => {
    for (const e of COMPANY_REGISTRY) {
      expect(PLATFORMS_WITH_ADAPTERS).toContain(e.platform);
    }
  });

  it("has a site set on every workday entry", () => {
    const workdayEntries = COMPANY_REGISTRY.filter((e) => e.platform === "workday");
    expect(workdayEntries.length).toBeGreaterThan(0);
    for (const e of workdayEntries) {
      expect(typeof e.site).toBe("string");
      expect(e.site).not.toBe("");
    }
  });

  it("has every entry enabled", () => {
    for (const e of COMPANY_REGISTRY) {
      expect(e.enabled).toBe(true);
    }
  });
});

describe("PLATFORM_SOURCE_META / buildSourceProposal / admitSource", () => {
  it("each of the four platform proposals passes admitSource individually", () => {
    for (const platform of PLATFORMS_WITH_ADAPTERS) {
      const proposal = buildSourceProposal(PLATFORM_SOURCE_META[platform]);
      const decision = admitSource(proposal, []);
      expect(decision.admit).toBe(true);
      expect(decision.failed_checks).toEqual([]);
    }
  });

  it("all four proposals together stay within the global maintenance budget (4 x 2 = 8 <= 50)", () => {
    const admitted: AdmittedSource[] = [];
    for (const platform of PLATFORMS_WITH_ADAPTERS) {
      const proposal = buildSourceProposal(PLATFORM_SOURCE_META[platform]);
      const decision = admitSource(proposal, admitted);
      expect(decision.admit).toBe(true);
      admitted.push({ name: proposal.name, est_maint_min_per_week: proposal.est_maint_min_per_week, probation: decision.probation });
    }
    const totalMaint = admitted.reduce((sum, a) => sum + a.est_maint_min_per_week, 0);
    expect(totalMaint).toBe(8);
  });
});
