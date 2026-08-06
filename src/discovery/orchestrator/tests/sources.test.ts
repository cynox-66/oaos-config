// sources.test.ts
// File: src/discovery/orchestrator/tests/sources.test.ts
// Purpose: Guards on the Stage-3 source table — that it declares every built
//          source, that its rows build without network, and that the set of
//          ACTIVATED rows matches the recorded allow-list below (Wave 6 built
//          the ability to run; activating a source is Wave 8 and operator-paced).

import { describe, it, expect } from "vitest";
import { STAGE3_SOURCES, findSourceEntry, sourceNames } from "../sources";
import { COMPANY_REGISTRY } from "../../stage3/registry";
import { preferencesFixture } from "../../stage3/tests/query-helpers";
import type { SourceDeps } from "../../stage3/types";
import type { SourceBuildContext } from "../types";

/**
 * The build context a real run supplies. Wave 5's query_net rows REQUIRE
 * `preferences` and throw without it, so every "build every row" guard below
 * uses this rather than `{}`.
 */
const ctx: SourceBuildContext = {
  preferences: preferencesFixture(["Kubernetes", "Security"]),
  adzunaAppId: "test-id",
  adzunaAppKey: "test-key",
};

const noNetwork: SourceDeps = {
  httpGet: async () => {
    throw new Error("no network in tests");
  },
  httpPost: async () => {
    throw new Error("no network in tests");
  },
  now: () => "2026-07-28T00:00:00.000Z",
};

describe("the Stage-3 source table", () => {
  it("declares every source built in Waves 3, 4 and 5", () => {
    expect(sourceNames()).toEqual([
      "greenhouse",
      "lever",
      "workday",
      "ashby",
      "esoc",
      "nlnet",
      "ghsl",
      "cncf-lfx",
      "lfdt",
      "outreachy",
      "himalayas",
      "freehire",
      "adzuna",
      "remotive",
      "hn-hiring",
    ]);
  });

  it("enables exactly the sources on the recorded activation allow-list", () => {
    // If this fails, someone activated (or deactivated) a source in the repo.
    // That is a Wave 8 decision the operator makes by editing sources.ts, not a
    // code change to be merged casually.
    //
    // ACTIVATION PROTOCOL: a name goes in ACTIVATED_SOURCES *and* its row flips
    // to `enabled: true` in sources.ts, in the SAME commit. The two must always
    // be changed together — that pairing is the whole point of this guard.
    // Removing an activation means removing both, likewise together.
    //
    //   greenhouse — activated 2026-07-28, the first live Stage-3 source.
    //   himalayas  — activated 2026-08-06, the first query_net source (ruling
    //                Q5), sequenced after the G1 geo filter landed so its
    //                India-eligible slice is reachable rather than buried.
    //
    // The assertion runs in both directions on purpose: name-not-in-list
    // catches an unrecorded flip, list-name-not-enabled catches an allow-list
    // entry left stale after a deactivation.
    const ACTIVATED_SOURCES = ["greenhouse", "himalayas"];

    const enabled = STAGE3_SOURCES.filter((e) => e.enabled).map((e) => e.name);

    expect(enabled.slice().sort()).toEqual(ACTIVATED_SOURCES.slice().sort());
    for (const name of ACTIVATED_SOURCES) {
      expect(findSourceEntry(name)?.enabled, `${name} is on the allow-list but not enabled`).toBe(
        true
      );
    }
  });

  it("has unique names — the name is both the --source argument and the health key", () => {
    expect(new Set(sourceNames()).size).toBe(STAGE3_SOURCES.length);
  });

  it("routes exactly the three D18 calendar sources to the calendar sink", () => {
    expect(STAGE3_SOURCES.filter((e) => e.sink === "calendar").map((e) => e.name)).toEqual([
      "cncf-lfx",
      "lfdt",
      "outreachy",
    ]);
  });

  it("builds every row without touching the network, with a matching family", () => {
    for (const entry of STAGE3_SOURCES) {
      const source = entry.build(ctx);
      expect(source.family).toBe(entry.family);
      expect(typeof source.fetch).toBe("function");
      expect(typeof source.healthCheck).toBe("function");
    }
  });

  it("gives each company_board platform its own row, over the shared registry", () => {
    const platforms = new Set(COMPANY_REGISTRY.map((e) => e.platform));
    const rows = STAGE3_SOURCES.filter((e) => e.family === "company_board").map((e) => e.name);
    expect(new Set(rows)).toEqual(platforms);
  });

  it("gives each platform ONLY its own registry entries", async () => {
    // Regression, live-caught 2026-07-28: createCompanyBoardSource hands every
    // entry it is given to adapter.fetchOne without checking entry.platform, so
    // an unsliced registry makes each adapter fetch every other platform's
    // company against its own API — five spurious 404s on the Ashby row, which
    // would push a healthy family toward auto_disabled.
    for (const row of STAGE3_SOURCES.filter((e) => e.family === "company_board")) {
      const requested: string[] = [];
      const source = row.build(ctx);
      await source.fetch({
        httpGet: async (url) => {
          requested.push(url);
          return { status: 200, body: "[]" };
        },
        httpPost: async (url) => {
          requested.push(url);
          return { status: 200, body: JSON.stringify({ total: 0, jobPostings: [] }) };
        },
        now: () => "2026-07-28T00:00:00.000Z",
      });

      const mine = COMPANY_REGISTRY.filter((e) => e.platform === row.name);
      const others = COMPANY_REGISTRY.filter((e) => e.platform !== row.name);

      expect(requested.length).toBeGreaterThanOrEqual(mine.length);
      for (const foreign of others) {
        expect(requested.join(" ")).not.toContain(foreign.token);
      }
    }
  });

  it("routes every Wave 5 query_net row to the pipeline sink", () => {
    expect(STAGE3_SOURCES.filter((e) => e.family === "query_net").map((e) => e.name)).toEqual([
      "himalayas",
      "freehire",
      "adzuna",
      "remotive",
      "hn-hiring",
    ]);
    for (const row of STAGE3_SOURCES.filter((e) => e.family === "query_net")) {
      expect(row.sink).toBe("pipeline");
    }
  });

  it("query_net rows refuse to build without the operator's confirmed scope", () => {
    // A missing preferences.json must surface as a reported build_error, never
    // as a source quietly searching a scope nobody approved (D15).
    for (const row of STAGE3_SOURCES.filter((e) => e.family === "query_net" && e.name !== "remotive")) {
      expect(() => row.build({})).toThrow(/preferences\.json/);
    }
  });

  it("remotive builds without scope — it is scope-independent by necessity", () => {
    expect(() => findSourceEntry("remotive")?.build({})).not.toThrow();
  });

  it("adzuna builds without credentials and reports the gap at fetch time", async () => {
    const source = findSourceEntry("adzuna")?.build({ preferences: ctx.preferences });
    expect(source).toBeDefined();
    const result = await source!.fetch(noNetwork);
    expect(result.items).toEqual([]);
    expect(result.errors[0].detail).toContain("ADZUNA_APP_ID");
  });

  it("passes the GitHub token through to the github_repo family", () => {
    // Constructing with a token must not throw; the token is read lazily.
    const esoc = findSourceEntry("esoc");
    expect(esoc).toBeDefined();
    expect(() => esoc?.build({ githubToken: "ghp_fake" })).not.toThrow();
  });

  it("findSourceEntry returns undefined for an unknown name", () => {
    expect(findSourceEntry("does-not-exist")).toBeUndefined();
    expect(findSourceEntry("nlnet")?.name).toBe("nlnet");
  });

  it("never performs I/O at module load or build time", async () => {
    // Every row builds, and nothing calls the deps until fetch/healthCheck.
    for (const entry of STAGE3_SOURCES) {
      const source = entry.build(ctx);
      expect(source.name.length).toBeGreaterThan(0);
    }
    // Sanity: the no-network deps really would throw if a build had used them.
    await expect(noNetwork.httpGet("https://example.test")).rejects.toThrow("no network in tests");
  });
});
