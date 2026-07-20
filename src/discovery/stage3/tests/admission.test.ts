// admission.test.ts
// File: src/discovery/stage3/tests/admission.test.ts

import { describe, expect, it } from "vitest";
import { buildSourceProposal } from "../admission";
import { admitSource } from "../../../engines/source-admission/source-admission";
import type { SourceMeta } from "../types";

describe("buildSourceProposal", () => {
  it("maps a fixture SourceMeta into a SourceProposal that the real Engine 11 checks accept", () => {
    const meta: SourceMeta = {
      name: "greenhouse",
      ingestion_method: "api",
      auth_required: false,
      est_volume_per_week: 40,
      est_maint_min_per_week: 5,
    };

    const proposal = buildSourceProposal(meta);

    expect(proposal).toEqual({
      name: "greenhouse",
      type: "api",
      auth_required: false,
      est_volume_per_week: 40,
      est_maint_min_per_week: 5,
      cost_per_month_inr: 0,
      has_health_check: true,
      dedupe_compatible: true,
      survives_format_change: true,
      justification: undefined,
    });

    const decision = admitSource(proposal, []);
    expect(decision.admit).toBe(true);
    expect(decision.failed_checks).toEqual([]);
  });

  it("atom_feed sources map to ingestion type 'rss' (no dedicated atom enum value)", () => {
    const meta: SourceMeta = {
      name: "nlnet",
      ingestion_method: "rss",
      auth_required: false,
      est_volume_per_week: 5,
      est_maint_min_per_week: 2,
    };
    const decision = admitSource(buildSourceProposal(meta), []);
    expect(decision.admit).toBe(true);
  });

  it("defaults cost_per_month_inr to 0 when omitted", () => {
    const meta: SourceMeta = {
      name: "x",
      ingestion_method: "api",
      auth_required: true,
      est_volume_per_week: 1,
      est_maint_min_per_week: 1,
    };
    expect(buildSourceProposal(meta).cost_per_month_inr).toBe(0);
  });
});
