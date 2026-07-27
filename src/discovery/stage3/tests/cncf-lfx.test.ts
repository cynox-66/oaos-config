// cncf-lfx.test.ts
// File: src/discovery/stage3/tests/cncf-lfx.test.ts

import { describe, expect, it } from "vitest";
import { createCncfLfxSource, CNCF_LFX_CONFIG } from "../sources/cncf-lfx";
import type { SourceDeps } from "../types";
import termsListing from "./fixtures/cncf-lfx/2026-listing.json";

const now = () => "2026-07-21T00:00:00.000Z";

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("createCncfLfxSource", () => {
  it("D18: produces calendarEntries, never RawItems", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe("https://api.github.com/repos/cncf/mentoring/contents/programs/lfx-mentorship/2026");
        return { status: 200, body: JSON.stringify(termsListing) };
      },
    });
    const source = createCncfLfxSource();
    expect(source.family).toBe("github_repo");
    const result = await source.fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.calendarEntries).toHaveLength(3);
    expect(result.calendarEntries?.[0]).toMatchObject({
      title: "CNCF LFX Mentorship — 2026 term 01-Mar-May",
      url: "https://github.com/cncf/mentoring/tree/main/programs/lfx-mentorship/2026/01-Mar-May",
    });
  });

  it("filters out non-directory entries (e.g. a stray README.md)", async () => {
    const mixed = [...termsListing, { name: "README.md", path: "programs/lfx-mentorship/2026/README.md", type: "file", sha: "x", download_url: null }];
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify(mixed) }) });
    const result = await createCncfLfxSource().fetch(deps);
    expect(result.calendarEntries).toHaveLength(3);
  });

  it("http error -> errors populated, calendarEntries undefined", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 500, body: "" }) });
    const result = await createCncfLfxSource().fetch(deps);
    expect(result.calendarEntries).toBeUndefined();
    expect(result.errors[0]).toMatchObject({ kind: "http" });
  });

  it("healthCheck ok:true reports term count", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify(termsListing) }) });
    const result = await createCncfLfxSource().healthCheck(deps);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("3 term");
  });

  it("year is config, not hardcoded", () => {
    expect(CNCF_LFX_CONFIG.year).toBe("2026");
  });
});
