// geo-filter.test.ts
// File: src/discovery/orchestrator/tests/geo-filter.test.ts
// Purpose: The G1 geo filter inside runStage3 — placement (post-dedupe,
//          pre-prerank), per-source attribution, both unresolved policies,
//          the always-passes unknown_source rule (ruling Q2), and the
//          filter-off compatibility guarantee. All fakes, no I/O.

import { describe, expect, it } from "vitest";
import { runStage3 } from "../orchestrator";
import { createMemoryHealthStore } from "../health-store";
import type { RawItem } from "../../../engines/normalization/types";
import type { PrerankVocabulary } from "../../prerank/types";
import type { GeoPreference } from "../../scope/types";
import type { SourceDeps, Stage3Source } from "../../stage3/types";
import type { CalendarSinkResult, SourceTableEntry, Stage3RunDeps, Stage3RunSummary } from "../types";

const NOW = "2026-08-06T00:00:00.000Z";

function fakeDeps(): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now: () => NOW,
  };
}

const VOCABULARY: PrerankVocabulary = {
  domainTerms: ["kubernetes", "observability"],
  roleTerms: ["engineer"],
  negativeTerms: [],
};

const GEO: GeoPreference = { eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" };

/** A greenhouse-shaped item with a location and a distinct fingerprint host. */
function ghItem(host: string, locationName: string): RawItem {
  return {
    source_type: "job_board",
    source_name: "greenhouse:test",
    raw_payload: {
      title: `Kubernetes Engineer ${host}`,
      description: "Fully remote kubernetes observability engineer role",
      location: { name: locationName },
    },
    url: `https://${host}.example.com/jobs/1`,
    fetched_at: NOW,
  };
}

function fakeSource(name: string, items: RawItem[]): Stage3Source {
  return {
    name,
    family: "company_board",
    enabled: true,
    fetch: async () => ({ items, errors: [] }),
    healthCheck: async () => ({ ok: true, checkedAt: NOW, detail: "ok" }),
  };
}

function entry(name: string, items: RawItem[]): SourceTableEntry {
  return {
    name,
    enabled: true,
    sink: "pipeline",
    family: "company_board",
    build: () => fakeSource(name, items),
  };
}

const noCalendar = (): CalendarSinkResult => ({ written: 0, refused: [] });

function deps(entries: SourceTableEntry[], over: Partial<Stage3RunDeps> = {}): Stage3RunDeps {
  return {
    entries,
    sourceDeps: fakeDeps(),
    vocabulary: VOCABULARY,
    health: createMemoryHealthStore(),
    writeCalendar: noCalendar,
    processItem: async () => ({ ok: true, errors: [] }),
    buildContext: {},
    dryRun: true,
    ...over,
  };
}

const ITEMS = [
  ghItem("a", "India (Remote)"), // eligible
  ghItem("b", "United States (Remote)"), // ineligible
  ghItem("c", "Spain (Remote)"), // ineligible
  ghItem("d", "(Remote)"), // unresolved
];

describe("runStage3 — geo filter placement and counts", () => {
  it("gates ineligible items BEFORE prerank: they appear in geo counts and never in prerank totals", async () => {
    const summary = await runStage3(deps([entry("greenhouse", ITEMS)], { geo: GEO }));

    expect(summary.geo).toEqual({
      total: 4,
      eligible: 1,
      ineligible: 2,
      unresolved: 1,
      unresolvedPolicy: "pass",
      unknownSource: 0,
      unknownSources: [],
    });
    // Prerank saw only eligible + unresolved(pass) = 2 items.
    expect(summary.prerank?.total).toBe(2);

    const source = summary.sources.find((s) => s.name === "greenhouse")!;
    expect(source.geoIneligible).toBe(2);
    expect(source.geoUnresolved).toBe(1);
    expect(source.geoUnknownSource).toBe(0);
  });

  it('under "gate", unresolved items are dropped and reported — never silently', async () => {
    const gate: GeoPreference = { ...GEO, unresolved: "gate" };
    const summary = await runStage3(deps([entry("greenhouse", ITEMS)], { geo: gate }));

    expect(summary.geo?.unresolved).toBe(1);
    expect(summary.geo?.unresolvedPolicy).toBe("gate");
    expect(summary.prerank?.total).toBe(1); // eligible only
  });

  it("unknown_source items ALWAYS pass, under BOTH policies, and the source is NAMED (ruling Q2)", async () => {
    const hnItem: RawItem = {
      source_type: "job_board",
      source_name: "hn",
      raw_payload: { title: "Kubernetes Engineer hn", description: "remote kubernetes engineer" },
      url: "https://hn.example.com/jobs/1",
      fetched_at: NOW,
    };

    for (const policy of ["pass", "gate"] as const) {
      const summary = await runStage3(
        deps([entry("greenhouse", [ITEMS[1]]), entry("hn-hiring", [hnItem])], {
          geo: { ...GEO, unresolved: policy },
        })
      );
      expect(summary.geo?.unknownSource).toBe(1);
      expect(summary.geo?.unknownSources).toEqual(["hn-hiring"]);
      expect(summary.prerank?.total).toBe(1); // the hn item, regardless of policy
      const hn = summary.sources.find((s) => s.name === "hn-hiring")!;
      expect(hn.geoUnknownSource).toBe(1);
    }
  });

  it("geo runs AFTER within-run dedupe — a duplicate fingerprint is deduped, not double-counted by geo", async () => {
    const dupe = ghItem("a", "India (Remote)"); // same host/title as ITEMS[0] → same fingerprint
    const summary = await runStage3(deps([entry("greenhouse", [ITEMS[0], dupe])], { geo: GEO }));
    const source = summary.sources.find((s) => s.name === "greenhouse")!;
    expect(source.deduped).toBe(1);
    expect(summary.geo?.total).toBe(1);
  });
});

describe("runStage3 — filter-off compatibility", () => {
  async function run(geo: Stage3RunDeps["geo"]): Promise<Stage3RunSummary> {
    return runStage3(deps([entry("greenhouse", ITEMS)], geo === undefined ? {} : { geo }));
  }

  it("geo: null (a confirmed `geo off`) disables the filter — geo block null, prerank sees everything", async () => {
    const summary = await run(null);
    expect(summary.geo).toBeNull();
    expect(summary.prerank?.total).toBe(4);
  });

  it("geo omitted (pre-G1 caller) behaves identically to null", async () => {
    const withNull = await run(null);
    const omitted = await run(undefined);
    expect(omitted.geo).toBeNull();
    expect(omitted.prerank).toEqual(withNull.prerank);
    expect(omitted.sources.map((s) => s.prerankPassed)).toEqual(
      withNull.sources.map((s) => s.prerankPassed)
    );
  });
});
