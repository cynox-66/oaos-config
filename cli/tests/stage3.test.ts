// stage3.test.ts
// File: cli/tests/stage3.test.ts
// Purpose: The pure decision surface of `oaos discover --stage3` — flag parsing
//          and source selection — plus the run-summary renderer. No network,
//          no disk, no credentials.

import { describe, it, expect } from "vitest";
import { parseStage3Args, selectEntries, Stage3ArgsError } from "../commands/stage3";
import { formatStage3Summary, formatReport } from "../format";
import type { SourceTableEntry } from "../../src/discovery/orchestrator";
import type { Stage3RunSummary, SourceRunSummary } from "../../src/discovery/orchestrator/types";

// ============================================================
// parseStage3Args
// ============================================================

describe("parseStage3Args", () => {
  it("parses --all-enabled", () => {
    expect(parseStage3Args(["--stage3", "--all-enabled"])).toEqual({
      source: null,
      allEnabled: true,
      reenable: null,
      dryRun: false,
    });
  });

  it("parses --source with a value, in both flag forms", () => {
    expect(parseStage3Args(["--stage3", "--source", "nlnet"]).source).toBe("nlnet");
    expect(parseStage3Args(["--stage3", "--source=nlnet"]).source).toBe("nlnet");
  });

  it("parses --reenable and --dry-run", () => {
    const args = parseStage3Args(["--stage3", "--reenable", "greenhouse"]);
    expect(args.reenable).toBe("greenhouse");
    expect(parseStage3Args(["--stage3", "--source", "nlnet", "--dry-run"]).dryRun).toBe(true);
  });

  it("REFUSES a bare --stage3 rather than defaulting to a full run", () => {
    // Deciding what runs is the operator's call; a typo must not start one.
    expect(() => parseStage3Args(["--stage3"])).toThrow(Stage3ArgsError);
    expect(() => parseStage3Args(["--stage3"])).toThrow(/needs one of --all-enabled/);
  });

  it("refuses two modes at once", () => {
    expect(() => parseStage3Args(["--stage3", "--all-enabled", "--source", "nlnet"])).toThrow(
      /exactly one of/
    );
  });

  it("refuses a valueless --source or --reenable instead of silently ignoring it", () => {
    expect(() => parseStage3Args(["--stage3", "--source"])).toThrow(/--source needs a source name/);
    expect(() => parseStage3Args(["--stage3", "--source", "--dry-run"])).toThrow(
      /--source needs a source name/
    );
    expect(() => parseStage3Args(["--stage3", "--reenable"])).toThrow(/--reenable needs a source name/);
  });

  it("names the usage in every error, so the message is actionable", () => {
    expect(() => parseStage3Args(["--stage3"])).toThrow(/oaos discover --stage3 --all-enabled/);
  });
});

// ============================================================
// selectEntries
// ============================================================

const table: SourceTableEntry[] = [
  { name: "on", enabled: true, sink: "pipeline", family: "atom_feed", build: () => ({}) as never },
  { name: "off", enabled: false, sink: "pipeline", family: "atom_feed", build: () => ({}) as never },
  { name: "cal", enabled: true, sink: "calendar", family: "atom_feed", build: () => ({}) as never },
];

describe("selectEntries", () => {
  it("--all-enabled selects only rows whose toggle is on", () => {
    const selected = selectEntries(parseStage3Args(["--stage3", "--all-enabled"]), table);
    expect(selected.map((e) => e.name)).toEqual(["on", "cal"]);
  });

  it("--source runs a DISABLED row: naming it is the operator's activation gesture", () => {
    const selected = selectEntries(parseStage3Args(["--stage3", "--source", "off"]), table);
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe("off");
    expect(selected[0].enabled).toBe(true);
  });

  it("does not mutate the shipped table when overriding a toggle", () => {
    selectEntries(parseStage3Args(["--stage3", "--source", "off"]), table);
    expect(table.find((e) => e.name === "off")?.enabled).toBe(false);
  });

  it("rejects an unknown source name and lists the known ones", () => {
    expect(() => selectEntries(parseStage3Args(["--stage3", "--source", "nope"]), table)).toThrow(
      Stage3ArgsError
    );
    expect(() => selectEntries(parseStage3Args(["--stage3", "--source", "nope"]), table)).toThrow(
      /Known sources: on, off, cal/
    );
  });

  it("returns an empty selection when nothing is enabled", () => {
    const allOff = table.map((e) => ({ ...e, enabled: false }));
    expect(selectEntries(parseStage3Args(["--stage3", "--all-enabled"]), allOff)).toEqual([]);
  });
});

// ============================================================
// formatStage3Summary
// ============================================================

function sourceRow(overrides: Partial<SourceRunSummary> = {}): SourceRunSummary {
  return {
    name: "nlnet",
    family: "atom_feed",
    sink: "pipeline",
    status: "ran",
    fetched: 0,
    calendarRouted: 0,
    deduped: 0,
    prerankPassed: 0,
    prerankGated: 0,
    gatedByReason: {},
    written: 0,
    errors: [],
    health: { status: "healthy", consecutiveFailures: 0, detail: "ok, 12 entries", recovered: false },
    ...overrides,
  };
}

function summary(overrides: Partial<Stage3RunSummary> = {}): Stage3RunSummary {
  return {
    dryRun: false,
    runTimestamp: "2026-07-28T00:00:00.000Z",
    sources: [sourceRow()],
    geo: null,
    prerank: null,
    calendar: null,
    autoDisabled: [],
    recovered: [],
    ...overrides,
  };
}

describe("formatStage3Summary — geo block (G1)", () => {
  const geoBlock = (over: Partial<NonNullable<Stage3RunSummary["geo"]>> = {}) => ({
    total: 324,
    eligible: 8,
    ineligible: 313,
    unresolved: 3,
    unresolvedPolicy: "pass" as const,
    unknownSource: 0,
    unknownSources: [] as string[],
    ...over,
  });

  it("renders the geo line with the unresolved policy spelled out", () => {
    const out = formatStage3Summary(summary({ geo: geoBlock() }));
    expect(out).toMatch(/Geo: 324 in → 8 eligible, 313 ineligible, 3 unresolved \(passed\)/);
  });

  it("marks gated unresolved items as GATED", () => {
    const out = formatStage3Summary(summary({ geo: geoBlock({ unresolvedPolicy: "gate" }) }));
    expect(out).toMatch(/3 unresolved \(GATED\)/);
  });

  it("NAMES unmapped sources loudly when their items bypass the filter (ruling Q2)", () => {
    const out = formatStage3Summary(
      summary({ geo: geoBlock({ unknownSource: 12, unknownSources: ["hn-hiring", "nlnet"] }) })
    );
    expect(out).toContain("NO geo mapper");
    expect(out).toContain("hn-hiring, nlnet");
  });

  it("omits the geo block entirely when the filter is off", () => {
    const out = formatStage3Summary(summary({ geo: null }));
    expect(out).not.toContain("Geo:");
  });
});

describe("formatStage3Summary", () => {
  it("renders a per-source row with every counter", () => {
    const out = formatStage3Summary(
      summary({
        sources: [sourceRow({ fetched: 12, deduped: 2, prerankPassed: 6, prerankGated: 4, written: 6 })],
        prerank: { total: 10, passed: 6, gated: 4, gatedByReason: { beyond_k: 3, location: 1 } },
      })
    );
    expect(out).toMatch(/nlnet/);
    expect(out).toMatch(/Prerank: 10 in → 6 passed, 4 gated \(beyond_k 3, location 1\)/);
    expect(out).toMatch(/1 source ran/);
  });

  it("labels a dry run and says nothing was persisted", () => {
    const out = formatStage3Summary(summary({ dryRun: true }));
    expect(out).toMatch(/dry-run — nothing persisted/);
    expect(out).toMatch(/nothing was persisted \(no pipeline, no calendar, no health write\)/);
  });

  it("distinguishes the three skip reasons", () => {
    const out = formatStage3Summary(
      summary({
        sources: [
          sourceRow({ name: "a", status: "skipped_disabled", health: null }),
          sourceRow({ name: "b", status: "skipped_auto_disabled" }),
          sourceRow({ name: "c", status: "build_error", health: null }),
        ],
      })
    );
    expect(out).toMatch(/a\s+skipped — disabled in the source table/);
    expect(out).toMatch(/b\s+skipped — AUTO-DISABLED/);
    expect(out).toMatch(/c\s+skipped — build error/);
    expect(out).toMatch(/\(no source ran\)/);
  });

  it("surfaces auto-disabled sources with the exact re-enable command", () => {
    const out = formatStage3Summary(summary({ autoDisabled: ["greenhouse", "lever"] }));
    expect(out).toMatch(/⚠ AUTO-DISABLED: greenhouse, lever/);
    expect(out).toMatch(/oaos discover --stage3 --reenable <name>/);
    expect(out).toMatch(/Stage-1 manual intake/);
  });

  it("surfaces a recovery WITHOUT implying the source resumed", () => {
    const out = formatStage3Summary(summary({ recovered: ["nlnet"] }));
    expect(out).toMatch(/↻ RECOVERED: nlnet/);
    expect(out).toMatch(/never resumes a source by itself/);
  });

  it("prints per-source errors attributed by name", () => {
    const out = formatStage3Summary(
      summary({ sources: [sourceRow({ errors: ["greenhouse:tailscale [http] unexpected status 404"] })] })
    );
    expect(out).toMatch(/\[nlnet\] greenhouse:tailscale \[http\] unexpected status 404/);
  });

  it("reports calendar writes and refusals", () => {
    const out = formatStage3Summary(
      summary({
        calendar: {
          written: 3,
          refused: [{ entry: { title: "", date: null, url: null, description: null }, reason: "no key" }],
        },
      })
    );
    expect(out).toMatch(/Calendar \(D18\): 3 entries written · 1 refused/);
  });
});

// ============================================================
// formatReport — Stage-3 health section
// ============================================================

describe("formatReport source-health section", () => {
  const base = {
    discoveredThisWeek: 0,
    sentThisWeek: 0,
    responsesAllTime: 0,
    followUpsDueToday: 0,
    topUnactioned: [],
  };

  it("is omitted entirely when no Stage-3 run has ever happened", () => {
    expect(formatReport(base)).not.toMatch(/Stage-3 source health/);
  });

  it("says so explicitly when the health file exists but is empty", () => {
    expect(formatReport({ ...base, sourceHealth: [] })).toMatch(/no source has been checked yet/);
  });

  it("carries the last check's detail VERBATIM", () => {
    const out = formatReport({
      ...base,
      sourceHealth: [
        {
          name: "greenhouse",
          status: "healthy",
          consecutiveFailures: 0,
          detail: "degraded: 1/4 entries failed (greenhouse:tailscale); 91 items from the rest",
          checkedAt: "2026-07-28T00:00:00.000Z",
          recovered: false,
        },
      ],
    });
    expect(out).toMatch(/degraded: 1\/4 entries failed \(greenhouse:tailscale\); 91 items from the rest/);
    expect(out).toMatch(/✓ greenhouse/);
  });

  it("shows the consecutive-failure count on probation", () => {
    const out = formatReport({
      ...base,
      sourceHealth: [
        {
          name: "lever",
          status: "probation",
          consecutiveFailures: 1,
          detail: "failed: unexpected status 500",
          checkedAt: "2026-07-28T00:00:00.000Z",
          recovered: false,
        },
      ],
    });
    expect(out).toMatch(/! lever\s+probation \(1 consecutive\)/);
  });

  it("raises an auto-disabled alert with the re-enable command and the manual fallback", () => {
    const out = formatReport({
      ...base,
      sourceHealth: [
        {
          name: "workday",
          status: "auto_disabled",
          consecutiveFailures: 2,
          detail: "all 1 entries failed: workday:redhat",
          checkedAt: "2026-07-28T00:00:00.000Z",
          recovered: false,
        },
      ],
    });
    expect(out).toMatch(/⚠ AUTO-DISABLED \(1\): workday/);
    expect(out).toMatch(/Fall back to Stage-1 manual/);
    expect(out).toMatch(/oaos discover --stage3 --reenable <name>/);
  });

  it("raises a recovery alert that still requires an explicit re-enable", () => {
    const out = formatReport({
      ...base,
      sourceHealth: [
        {
          name: "nlnet",
          status: "healthy",
          consecutiveFailures: 0,
          detail: "ok, 12 entries",
          checkedAt: "2026-07-28T00:00:00.000Z",
          recovered: true,
        },
      ],
    });
    expect(out).toMatch(/↻ RECOVERED \(1\): nlnet/);
    expect(out).toMatch(/never resumes a source by/);
  });
});
