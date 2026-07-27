// ashby.test.ts
// File: src/discovery/stage3/tests/ashby.test.ts

import { describe, expect, it } from "vitest";
import { ashbyAdapter } from "../adapters/ashby";
import type { CompanyRegistryEntry, SourceDeps } from "../types";
import jobsFixture from "./fixtures/ashby/jobs.json";
import jobsEmptyFixture from "./fixtures/ashby/jobs-empty.json";

const now = () => "2026-07-20T00:00:00.000Z";
const entry: CompanyRegistryEntry = { company: "SigNoz", platform: "ashby", token: "signoz", enabled: true };

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("ashbyAdapter.fetchOne", () => {
  it("maps jobs to RawItems with untouched payload and jobUrl", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe("https://api.ashbyhq.com/posting-api/job-board/signoz");
        return { status: 200, body: JSON.stringify(jobsFixture) };
      },
    });

    const items = await ashbyAdapter.fetchOne(entry, deps);

    expect(items).toHaveLength(2);
    expect(items[0].source_type).toBe("job_board");
    expect(items[0].source_name).toBe("ashby:signoz");
    expect(items[0].url).toBe(jobsFixture.jobs[0].jobUrl);
    expect(items[0].fetched_at).toBe(now());
    expect(items[0].raw_payload).toEqual(jobsFixture.jobs[0]);
  });

  it("falls back to applyUrl when jobUrl is absent", async () => {
    const job = { ...jobsFixture.jobs[0] } as Record<string, unknown>;
    delete job.jobUrl;
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify({ jobs: [job] }) }),
    });
    const items = await ashbyAdapter.fetchOne(entry, deps);
    expect(items[0].url).toBe(job.applyUrl);
  });

  it("returns an empty array for an empty board, no error thrown", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify(jobsEmptyFixture) }),
    });
    const items = await ashbyAdapter.fetchOne(entry, deps);
    expect(items).toEqual([]);
  });

  it("throws SourceFetchError kind http on non-200", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 404, body: "" }) });
    await expect(ashbyAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "http" });
  });

  it("throws SourceFetchError kind parse on garbage JSON", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: "not json{{{" }) });
    await expect(ashbyAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "parse" });
  });

  it("throws SourceFetchError kind shape on valid JSON with the wrong shape", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify({ notJobs: [] }) }) });
    await expect(ashbyAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "shape" });
  });
});
