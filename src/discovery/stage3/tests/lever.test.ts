// lever.test.ts
// File: src/discovery/stage3/tests/lever.test.ts

import { describe, expect, it } from "vitest";
import { leverAdapter } from "../adapters/lever";
import type { CompanyRegistryEntry, SourceDeps } from "../types";
import postingsFixture from "./fixtures/lever/postings.json";
import postingsEmptyFixture from "./fixtures/lever/postings-empty.json";

const now = () => "2026-07-20T00:00:00.000Z";
const entry: CompanyRegistryEntry = { company: "Sysdig", platform: "lever", token: "sysdig", enabled: true };

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("leverAdapter.fetchOne", () => {
  it("maps postings to RawItems with untouched payload and hostedUrl", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe("https://api.lever.co/v0/postings/sysdig?mode=json");
        return { status: 200, body: JSON.stringify(postingsFixture) };
      },
    });

    const items = await leverAdapter.fetchOne(entry, deps);

    expect(items).toHaveLength(2);
    expect(items[0].source_type).toBe("job_board");
    expect(items[0].source_name).toBe("lever:sysdig");
    expect(items[0].url).toBe(postingsFixture[0].hostedUrl);
    expect(items[0].fetched_at).toBe(now());
    expect(items[0].raw_payload).toEqual(postingsFixture[0]);
  });

  it("returns an empty array for an empty board, no error thrown", async () => {
    const deps = depsWith({
      httpGet: async () => ({ status: 200, body: JSON.stringify(postingsEmptyFixture) }),
    });
    const items = await leverAdapter.fetchOne(entry, deps);
    expect(items).toEqual([]);
  });

  it("throws SourceFetchError kind http on non-200", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 404, body: "" }) });
    await expect(leverAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "http" });
  });

  it("throws SourceFetchError kind parse on garbage JSON", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: "not json{{{" }) });
    await expect(leverAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "parse" });
  });

  it("throws SourceFetchError kind shape when the response is valid JSON but not an array", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify({ error: "no such board" }) }) });
    await expect(leverAdapter.fetchOne(entry, deps)).rejects.toMatchObject({ kind: "shape" });
  });
});
