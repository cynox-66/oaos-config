// greenhouse.test.ts
// File: src/discovery/stage3/tests/greenhouse.test.ts

import { describe, expect, it } from "vitest";
import { greenhouseAdapter } from "../adapters/greenhouse";
import { SourceFetchError } from "../company-board";
import type { CompanyRegistryEntry, SourceDeps } from "../types";
import jobsFixture from "./fixtures/greenhouse/jobs.json";
import jobsEmptyFixture from "./fixtures/greenhouse/jobs-empty.json";

const now = () => "2026-07-20T00:00:00.000Z";
const entry: CompanyRegistryEntry = { company: "Grafana Labs", platform: "greenhouse", token: "grafanalabs", enabled: true };

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("greenhouseAdapter.fetchOne", () => {
  it("maps jobs to RawItems, preserves the original payload untouched, and adds description/place", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/grafanalabs/jobs?content=true");
        return { status: 200, body: JSON.stringify(jobsFixture) };
      },
    });

    const items = await greenhouseAdapter.fetchOne(entry, deps);

    expect(items).toHaveLength(2);
    expect(items[0].source_type).toBe("job_board");
    expect(items[0].source_name).toBe("greenhouse:grafanalabs");
    expect(items[0].url).toBe(jobsFixture.jobs[0].absolute_url);
    expect(items[0].fetched_at).toBe(now());

    // Preservation invariant (was an exact-equality check; now explicit since
    // the payload is no longer identical to the fixture — it gains two keys).
    // Every original fixture key must still be present with its original value.
    const original = jobsFixture.jobs[0] as Record<string, unknown>;
    const payload = items[0].raw_payload as Record<string, unknown>;
    for (const key of Object.keys(original)) {
      expect(payload[key]).toEqual(original[key]);
    }
    // The two added keys, mapped from content/location for Engine 1 to read.
    expect(payload.description).toBe(original.content);
    expect(payload.place).toBe((original.location as { name: string }).name);
    // `content` and `location` themselves are untouched, not overwritten.
    expect(payload.content).toBe(original.content);
    expect(payload.location).toEqual(original.location);
  });

  it("returns an empty array for an empty board, no error thrown", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify(jobsEmptyFixture) }),
    });
    const items = await greenhouseAdapter.fetchOne(entry, deps);
    expect(items).toEqual([]);
  });

  it("falls back to the plain listing when content=true fails, and returns items silently (no error)", async () => {
    let call = 0;
    const deps = depsWith({
      httpGet: async (url) => {
        call += 1;
        if (url.includes("content=true")) {
          return { status: 403, body: "" };
        }
        expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/grafanalabs/jobs");
        return { status: 200, body: JSON.stringify(jobsFixture) };
      },
    });

    const items = await greenhouseAdapter.fetchOne(entry, deps);

    expect(call).toBe(2);
    expect(items).toHaveLength(2);
    const original = jobsFixture.jobs[0] as Record<string, unknown>;
    const payload = items[0].raw_payload as Record<string, unknown>;
    for (const key of Object.keys(original)) {
      expect(payload[key]).toEqual(original[key]);
    }
  });

  it("throws SourceFetchError kind http when both content=true and plain listing fail", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 500, body: "" }),
    });
    await expect(greenhouseAdapter.fetchOne(entry, deps)).rejects.toBeInstanceOf(SourceFetchError);
    await expect(greenhouseAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "http" });
  });

  it("throws SourceFetchError kind parse on garbage JSON", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: "not json{{{" }),
    });
    await expect(greenhouseAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "parse" });
  });

  it("throws SourceFetchError kind shape on valid JSON with the wrong shape", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify({ notJobs: [] }) }),
    });
    await expect(greenhouseAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "shape" });
  });
});
