// wave4-admission.test.ts
// File: src/discovery/stage3/tests/wave4-admission.test.ts

import { describe, expect, it } from "vitest";
import { WAVE4_SOURCE_META } from "../sources/meta";
import { PLATFORM_SOURCE_META } from "../registry";
import { buildSourceProposal } from "../admission";
import { admitSource } from "../../../engines/source-admission";
import type { AdmittedSource } from "../../../engines/source-admission";

const WAVE4_SOURCES = ["esoc", "cncf-lfx", "lfdt", "nlnet", "outreachy", "ghsl"];
const WAVE3_PLATFORMS = ["greenhouse", "lever", "workday", "ashby"];

describe("Wave 4 admission proposals", () => {
  it("each Wave 4 source proposal passes admitSource individually", () => {
    for (const name of WAVE4_SOURCES) {
      const proposal = buildSourceProposal(WAVE4_SOURCE_META[name]);
      const decision = admitSource(proposal, []);
      expect(decision.admit).toBe(true);
      expect(decision.failed_checks).toEqual([]);
    }
  });

  it("all Wave 3 + Wave 4 proposals together stay within the global 50 min/week budget", () => {
    const admitted: AdmittedSource[] = [];

    for (const platform of WAVE3_PLATFORMS) {
      const proposal = buildSourceProposal(PLATFORM_SOURCE_META[platform]);
      const decision = admitSource(proposal, admitted);
      expect(decision.admit).toBe(true);
      admitted.push({
        name: proposal.name,
        est_maint_min_per_week: proposal.est_maint_min_per_week,
        probation: decision.probation,
      });
    }

    for (const name of WAVE4_SOURCES) {
      const proposal = buildSourceProposal(WAVE4_SOURCE_META[name]);
      const decision = admitSource(proposal, admitted);
      expect(decision.admit).toBe(true);
      admitted.push({
        name: proposal.name,
        est_maint_min_per_week: proposal.est_maint_min_per_week,
        probation: decision.probation,
      });
    }

    const totalMaint = admitted.reduce((sum, a) => sum + a.est_maint_min_per_week, 0);
    expect(totalMaint).toBe(19); // 4x2 (Wave 3) + 2+2+2+2+2+1 (Wave 4) = 8 + 11
    expect(totalMaint).toBeLessThanOrEqual(50);
  });
});
