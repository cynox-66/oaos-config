// greenhouse-normalize-seam.test.ts
// File: src/discovery/stage3/tests/greenhouse-normalize-seam.test.ts
// Purpose: Run greenhouseAdapter's real output through Engine 1's real
// normalize() — the seam no Wave-3 company_board adapter test previously
// crossed (Wave 5's sources did; this closes that gap for Greenhouse).
// Confirms the 2-A description/place mapping + the detectRemote(role) change
// together produce a populated description_norm, a populated location, and
// remote: "remote" from real (fixture-derived) Greenhouse data.

import { describe, expect, it } from "vitest";
import { greenhouseAdapter } from "../adapters/greenhouse";
import { normalize } from "../../../engines/normalization";
import type { CompanyRegistryEntry, SourceDeps } from "../types";
import jobsFixture from "./fixtures/greenhouse/jobs.json";

const now = () => "2026-07-20T00:00:00.000Z";
const entry: CompanyRegistryEntry = {
  company: "Grafana Labs",
  platform: "greenhouse",
  token: "grafanalabs",
  enabled: true,
};

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("greenhouse adapter -> Engine 1 normalize() seam", () => {
  it("real fixture job: description_norm and location populated", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify(jobsFixture) }),
    });
    const items = await greenhouseAdapter.fetchOne(entry, deps);
    const opp = normalize(items[0]);

    expect(opp.description_norm.length).toBeGreaterThan(0);
    expect(opp.description_norm).not.toMatch(/[<>]/); // HTML stripped
    expect(opp.location).toBe("Remote - US");
  });

  it("a title containing '| Remote' (constructed inline, fixture stays pristine) yields remote: 'remote'", async () => {
    // Not added to the committed fixture — see docs/known-issues.md /
    // CLAUDE.md R3: the fixture's value is being a real captured snapshot,
    // so a synthetic title variant is built here instead of edited into it.
    const jobWithRemoteTitle = {
      ...jobsFixture.jobs[0],
      title: "Senior Software Engineer, Backend | Spain | Remote",
    };
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify({ jobs: [jobWithRemoteTitle] }) }),
    });
    const items = await greenhouseAdapter.fetchOne(entry, deps);
    const opp = normalize(items[0]);

    expect(opp.remote).toBe("remote");
  });
});
