// wave5-admission.test.ts
// File: src/discovery/stage3/tests/wave5-admission.test.ts

import { describe, expect, it } from "vitest";
import { WAVE5_SOURCE_META } from "../sources/meta-wave5";
import { WAVE4_SOURCE_META } from "../sources/meta";
import { PLATFORM_SOURCE_META } from "../registry";
import { buildSourceProposal } from "../admission";
import { admitSource } from "../../../engines/source-admission";
import type { AdmittedSource } from "../../../engines/source-admission";

const WAVE5_SOURCES = ["himalayas", "freehire", "adzuna", "remotive", "hn-hiring"];
const WAVE4_SOURCES = ["esoc", "cncf-lfx", "lfdt", "nlnet", "outreachy", "ghsl"];
const WAVE3_PLATFORMS = ["greenhouse", "lever", "workday", "ashby"];

function admitAll(names: string[], meta: Record<string, (typeof WAVE5_SOURCE_META)[string]>, admitted: AdmittedSource[]) {
  for (const name of names) {
    const proposal = buildSourceProposal(meta[name]);
    const decision = admitSource(proposal, admitted);
    expect(decision.admit).toBe(true);
    admitted.push({
      name: proposal.name,
      est_maint_min_per_week: proposal.est_maint_min_per_week,
      probation: decision.probation,
    });
  }
}

describe("Wave 5 admission proposals", () => {
  it("each query_net proposal passes admitSource individually", () => {
    for (const name of WAVE5_SOURCES) {
      const decision = admitSource(buildSourceProposal(WAVE5_SOURCE_META[name]), []);
      expect(decision.admit).toBe(true);
      expect(decision.failed_checks).toEqual([]);
    }
  });

  it("adzuna's auth requirement does not block admission", () => {
    const proposal = buildSourceProposal(WAVE5_SOURCE_META.adzuna);
    expect(proposal.auth_required).toBe(true);
    expect(admitSource(proposal, []).admit).toBe(true);
  });

  it("no query_net source is routed to probation — none of them scrape", () => {
    for (const name of WAVE5_SOURCES) {
      const decision = admitSource(buildSourceProposal(WAVE5_SOURCE_META[name]), []);
      expect(decision.probation).toBe(false);
    }
  });

  it("every source with a cost or a caveat carries a justification", () => {
    for (const name of ["freehire", "adzuna", "remotive", "hn-hiring"]) {
      expect(WAVE5_SOURCE_META[name].justification ?? "").not.toBe("");
    }
  });

  it("all three waves together stay within the global 50 min/week budget", () => {
    const admitted: AdmittedSource[] = [];
    admitAll(WAVE3_PLATFORMS, PLATFORM_SOURCE_META, admitted);
    admitAll(WAVE4_SOURCES, WAVE4_SOURCE_META, admitted);
    admitAll(WAVE5_SOURCES, WAVE5_SOURCE_META, admitted);

    const total = admitted.reduce((sum, a) => sum + a.est_maint_min_per_week, 0);
    // 8 (Wave 3) + 11 (Wave 4) + 13 (Wave 5: 3+3+2+2+3)
    expect(total).toBe(32);
    expect(total).toBeLessThanOrEqual(50);
  });

  it("reports the remaining budget after the last Wave 5 source is admitted", () => {
    const admitted: AdmittedSource[] = [];
    admitAll(WAVE3_PLATFORMS, PLATFORM_SOURCE_META, admitted);
    admitAll(WAVE4_SOURCES, WAVE4_SOURCE_META, admitted);
    admitAll(WAVE5_SOURCES.slice(0, -1), WAVE5_SOURCE_META, admitted);

    const last = admitSource(buildSourceProposal(WAVE5_SOURCE_META["hn-hiring"]), admitted);
    expect(last.admit).toBe(true);
    expect(last.global_budget_remaining_min).toBe(18);
  });
});
