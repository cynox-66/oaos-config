// lfdt.test.ts
// File: src/discovery/stage3/tests/lfdt.test.ts

import { describe, expect, it } from "vitest";
import { createLfdtSource, LFDT_CONFIG } from "../sources/lfdt";
import type { SourceDeps } from "../types";
import docsProjectsListing from "./fixtures/lfdt/docs-projects-listing.json";

const now = () => "2026-07-21T00:00:00.000Z";

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("createLfdtSource", () => {
  it("D18: produces one calendarEntry for the current year's file, never RawItems", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe(
          "https://api.github.com/repos/LF-Decentralized-Trust-Mentorships/mentorship-program/contents/docs/projects"
        );
        return { status: 200, body: JSON.stringify(docsProjectsListing) };
      },
    });
    const source = createLfdtSource();
    expect(source.family).toBe("github_repo");
    const result = await source.fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.calendarEntries).toHaveLength(1);
    expect(result.calendarEntries?.[0]).toMatchObject({
      title: "LFDT Mentorship Program — 2026 project table",
      url: "https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/blob/main/docs/projects/2026.md",
    });
  });

  it("missing year file -> SourceError kind shape, no throw", async () => {
    const withoutCurrentYear = docsProjectsListing.filter((e) => e.name !== "2026.md");
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify(withoutCurrentYear) }) });
    const result = await createLfdtSource().fetch(deps);
    expect(result.calendarEntries).toBeUndefined();
    expect(result.errors).toEqual([
      {
        scope: "LF-Decentralized-Trust-Mentorships/mentorship-program:docs/projects",
        kind: "shape",
        detail: "no 2026.md found under docs/projects",
      },
    ]);
  });

  it("healthCheck ok:true reports entry count", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: JSON.stringify(docsProjectsListing) }) });
    const result = await createLfdtSource().healthCheck(deps);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("1 entry");
  });

  it("year is config, not hardcoded", () => {
    expect(LFDT_CONFIG.year).toBe("2026");
  });
});
