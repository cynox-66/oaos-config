// workday.test.ts
// File: src/discovery/stage3/tests/workday.test.ts

import { describe, expect, it } from "vitest";
import { workdayAdapter } from "../adapters/workday";
import type { CompanyRegistryEntry, SourceDeps } from "../types";
import jobPostingFixture from "./fixtures/workday/job-posting.json";

const now = () => "2026-07-20T00:00:00.000Z";
const entry: CompanyRegistryEntry = { company: "Red Hat", platform: "workday", token: "redhat", site: "Jobs", enabled: true };

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

function jobAt(index: number): Record<string, unknown> {
  return { ...jobPostingFixture, externalPath: `${jobPostingFixture.externalPath}-${index}` };
}

describe("workdayAdapter.fetchOne", () => {
  it("maps job postings to RawItems with untouched payload and externalPath-joined url", async () => {
    const deps = depsWith({
      httpPost: async (url, body) => {
        expect(url).toBe("https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/Jobs/jobs");
        expect(body).toEqual({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" });
        return { status: 200, body: JSON.stringify({ total: 1, jobPostings: [jobPostingFixture] }) };
      },
    });

    const items = await workdayAdapter.fetchOne(entry, deps);

    expect(items).toHaveLength(1);
    expect(items[0].source_type).toBe("job_board");
    expect(items[0].source_name).toBe("workday:redhat");
    expect(items[0].url).toBe(`https://redhat.wd5.myworkdayjobs.com/${entry.site}${jobPostingFixture.externalPath}`);
    expect(items[0].fetched_at).toBe(now());
    expect(items[0].raw_payload).toEqual(jobPostingFixture);
  });

  it("returns an empty array for an empty board, no error thrown", async () => {
    const deps = depsWith({
      httpPost: async () => ({ status: 200, body: JSON.stringify({ total: 0, jobPostings: [] }) }),
    });
    const items = await workdayAdapter.fetchOne(entry, deps);
    expect(items).toEqual([]);
  });

  it("paginates across pages (limit 20, total 45) collecting all 45 items in 3 requests", async () => {
    let calls = 0;
    const deps = depsWith({
      httpPost: async (_url, body) => {
        calls += 1;
        const { offset, limit } = body as { offset: number; limit: number };
        const remaining = 45 - offset;
        const pageSize = Math.min(limit, remaining);
        const jobPostings = Array.from({ length: pageSize }, (_, i) => jobAt(offset + i));
        return { status: 200, body: JSON.stringify({ total: 45, jobPostings }) };
      },
    });

    const items = await workdayAdapter.fetchOne(entry, deps);

    expect(calls).toBe(3);
    expect(items).toHaveLength(45);
  });

  it("throws SourceFetchError kind shape when the safety ceiling is reached before total is collected", async () => {
    const deps = depsWith({
      httpPost: async (_url, body) => {
        const { offset } = body as { offset: number };
        const jobPostings = Array.from({ length: 20 }, (_, i) => jobAt(offset + i));
        // total (600) exceeds the 500 safety ceiling — every page reports the same large total.
        return { status: 200, body: JSON.stringify({ total: 600, jobPostings }) };
      },
    });

    await expect(workdayAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "shape" });
  });

  it("throws SourceFetchError kind shape when the registry entry is missing site", async () => {
    const noSiteEntry: CompanyRegistryEntry = { company: "Red Hat", platform: "workday", token: "redhat", enabled: true };
    const deps = depsWith({});
    await expect(workdayAdapter.fetchOne(noSiteEntry, deps)).rejects.toMatchObject({ kind: "shape" });
  });

  it("throws SourceFetchError kind http on non-200", async () => {
    const deps = depsWith({ httpPost: async () => ({ status: 500, body: "" }) });
    await expect(workdayAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "http" });
  });

  it("throws SourceFetchError kind parse on garbage JSON", async () => {
    const deps = depsWith({ httpPost: async () => ({ status: 200, body: "not json{{{" }) });
    await expect(workdayAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "parse" });
  });

  it("throws SourceFetchError kind shape on valid JSON with the wrong shape", async () => {
    const deps = depsWith({ httpPost: async () => ({ status: 200, body: JSON.stringify({ nope: true }) }) });
    await expect(workdayAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "shape" });
  });
});
