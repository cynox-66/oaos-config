// orchestrator.test.ts
// File: src/discovery/orchestrator/tests/orchestrator.test.ts
// Purpose: The Stage-3 run coordinator, exercised entirely with injected fakes
//          — fake SourceDeps, a memory health store, a fake calendar sink, a
//          fake processItem. NO network, NO Airtable, NO Gemini, NO disk.
//
// The four invariants under test are the ones the orchestrator itself owns:
// per-source isolation, the D18 calendar boundary, one-way health without the
// operator, and a dry run persisting nothing.

import { describe, it, expect } from "vitest";
import { runStage3, reenableSource } from "../orchestrator";
import { createMemoryHealthStore } from "../health-store";
import { createCompanyBoardSource } from "../../stage3/company-board";
import { createHealthState } from "../../stage3/health";
import type { RawItem } from "../../../engines/normalization/types";
import type { PrerankVocabulary } from "../../prerank/types";
import type {
  CalendarEntry,
  CompanyBoardAdapter,
  CompanyRegistryEntry,
  FetchResult,
  HealthCheckResult,
  SourceDeps,
  Stage3Source,
} from "../../stage3/types";
import type { CalendarSinkResult, SourceTableEntry, Stage3RunDeps } from "../types";

// ============================================================
// Fixtures
// ============================================================

const NOW = "2026-07-28T00:00:00.000Z";

function fakeDeps(): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now: () => NOW,
  };
}

const VOCABULARY: PrerankVocabulary = {
  domainTerms: ["kubernetes", "ebpf", "observability"],
  roleTerms: ["engineer"],
  negativeTerms: [],
};

/**
 * A RawItem with a distinct fingerprint. `normalize`'s fingerprint is
 * sha1(company|role|url-host), so the HOST must differ per item or the
 * orchestrator's within-run dedupe will (correctly) collapse them.
 */
function item(host: string, text: string): RawItem {
  return {
    source_type: "job_board",
    source_name: "test",
    raw_payload: { title: text, description: `${text} Fully remote position. ${text}` },
    url: `https://${host}.example.com/jobs/1`,
    fetched_at: NOW,
  };
}

const OK: HealthCheckResult = { ok: true, checkedAt: NOW, detail: "ok, all good" };
const BAD: HealthCheckResult = { ok: false, checkedAt: NOW, detail: "endpoint returned 500" };

interface FakeSourceOptions {
  name: string;
  items?: RawItem[];
  calendarEntries?: CalendarEntry[];
  errors?: FetchResult["errors"];
  fetchThrows?: string;
  healthCheckThrows?: string;
  health?: HealthCheckResult;
  /** Records every call, so "was this even touched?" is assertable. */
  calls?: string[];
}

function fakeSource(o: FakeSourceOptions): Stage3Source {
  return {
    name: o.name,
    family: "atom_feed",
    enabled: true,
    fetch: async () => {
      o.calls?.push(`${o.name}:fetch`);
      if (o.fetchThrows) throw new Error(o.fetchThrows);
      return { items: o.items ?? [], errors: o.errors ?? [], calendarEntries: o.calendarEntries };
    },
    healthCheck: async () => {
      o.calls?.push(`${o.name}:healthCheck`);
      if (o.healthCheckThrows) throw new Error(o.healthCheckThrows);
      return o.health ?? OK;
    },
  };
}

function entry(
  name: string,
  source: Stage3Source,
  overrides: Partial<SourceTableEntry> = {}
): SourceTableEntry {
  return {
    name,
    enabled: true,
    sink: "pipeline",
    family: "atom_feed",
    build: () => source,
    ...overrides,
  };
}

const noCalendar = (): CalendarSinkResult => ({ written: 0, refused: [] });

function baseDeps(entries: SourceTableEntry[], overrides: Partial<Stage3RunDeps> = {}): Stage3RunDeps {
  return {
    entries,
    sourceDeps: fakeDeps(),
    vocabulary: VOCABULARY,
    health: createMemoryHealthStore(),
    writeCalendar: noCalendar,
    processItem: async () => ({ ok: true, errors: [] }),
    buildContext: {},
    dryRun: false,
    ...overrides,
  };
}

// ============================================================
// 1. Per-source isolation
// ============================================================

describe("per-source isolation", () => {
  it("one source throwing in fetch does not stop the others", async () => {
    const calls: string[] = [];
    const good = fakeSource({ name: "good", items: [item("a", "kubernetes engineer")], calls });
    const bad = fakeSource({ name: "bad", fetchThrows: "socket hang up", calls });
    const alsoGood = fakeSource({ name: "also-good", items: [item("b", "ebpf engineer")], calls });

    const processed: RawItem[] = [];
    const summary = await runStage3(
      baseDeps([entry("good", good), entry("bad", bad), entry("also-good", alsoGood)], {
        processItem: async (i) => {
          processed.push(i);
          return { ok: true, errors: [] };
        },
      })
    );

    // Every source was reached; the run did not abort.
    expect(summary.sources.map((s) => s.name)).toEqual(["good", "bad", "also-good"]);
    expect(summary.sources.every((s) => s.status === "ran")).toBe(true);
    expect(calls).toContain("also-good:fetch");

    // The failure is a recorded error, not a thrown one.
    const failed = summary.sources.find((s) => s.name === "bad") as { errors: string[]; fetched: number };
    expect(failed.fetched).toBe(0);
    expect(failed.errors.join(" ")).toMatch(/socket hang up/);

    // Both healthy sources' items still reached the pipeline.
    expect(processed).toHaveLength(2);
  });

  it("records fetch errors returned as results, with scope and kind", async () => {
    const source = fakeSource({
      name: "boards",
      items: [item("a", "kubernetes engineer role")],
      errors: [{ scope: "greenhouse:tailscale", kind: "http", detail: "unexpected status 404" }],
    });
    const summary = await runStage3(baseDeps([entry("boards", source)]));
    expect(summary.sources[0].errors).toEqual([
      "greenhouse:tailscale [http] unexpected status 404",
    ]);
    // A partial failure is still a run — items came through.
    expect(summary.sources[0].fetched).toBe(1);
  });

  it("a build() throw is reported as build_error, never fatal", async () => {
    const good = fakeSource({ name: "good", items: [item("a", "kubernetes engineer")] });
    const broken: SourceTableEntry = {
      name: "broken",
      enabled: true,
      sink: "pipeline",
      family: "atom_feed",
      build: () => {
        throw new Error("missing site on registry entry");
      },
    };

    const summary = await runStage3(baseDeps([broken, entry("good", good)]));
    expect(summary.sources[0].status).toBe("build_error");
    expect(summary.sources[0].errors[0]).toMatch(/missing site on registry entry/);
    expect(summary.sources[0].health).toBeNull();
    expect(summary.sources[1].status).toBe("ran");
  });

  it("a healthCheck throw counts as a failed check rather than losing the run", async () => {
    const source = fakeSource({ name: "flaky", healthCheckThrows: "ETIMEDOUT" });
    const summary = await runStage3(baseDeps([entry("flaky", source)]));
    expect(summary.sources[0].health?.status).toBe("probation");
    expect(summary.sources[0].health?.detail).toMatch(/healthCheck threw: ETIMEDOUT/);
  });

  it("one item failing in the pipeline does not strand the rest of the batch", async () => {
    const source = fakeSource({
      name: "feed",
      items: [item("a", "kubernetes engineer"), item("b", "ebpf engineer"), item("c", "observability engineer")],
    });
    let seen = 0;
    const summary = await runStage3(
      baseDeps([entry("feed", source)], {
        processItem: async () => {
          seen += 1;
          if (seen === 2) throw new Error("airtable 500");
          return { ok: true, errors: [] };
        },
      })
    );

    expect(seen).toBe(3);
    expect(summary.sources[0].written).toBe(2);
    expect(summary.sources[0].errors.join(" ")).toMatch(/airtable 500/);
  });
});

// ============================================================
// 2. D18 — the calendar boundary
// ============================================================

describe("D18 calendar boundary", () => {
  const calendarEntries: CalendarEntry[] = [
    { title: "Outreachy Dec 2026", date: "2026-12-01", url: "https://outreachy.org/apply", description: null },
  ];

  it("routes a calendar sink's entries to the writer and never to the pipeline", async () => {
    const source = fakeSource({ name: "outreachy", calendarEntries });
    const processed: RawItem[] = [];
    let written: CalendarEntry[] = [];

    const summary = await runStage3(
      baseDeps([entry("outreachy", source, { sink: "calendar" })], {
        processItem: async (i) => {
          processed.push(i);
          return { ok: true, errors: [] };
        },
        writeCalendar: (e) => {
          written = e;
          return { written: e.length, refused: [] };
        },
      })
    );

    expect(written).toEqual(calendarEntries);
    expect(processed).toEqual([]);
    expect(summary.sources[0].calendarRouted).toBe(1);
    expect(summary.calendar).toEqual({ written: 1, refused: [] });
    // No pipeline item existed, so prerank never ran.
    expect(summary.prerank).toBeNull();
  });

  it("DROPS a calendar sink's items and says so, if one ever emits any", async () => {
    // A format change could start producing items from a calendar-tracked
    // source. The boundary is enforced here, not merely assumed upstream.
    const source = fakeSource({
      name: "cncf-lfx",
      items: [item("a", "kubernetes engineer role")],
      calendarEntries,
    });
    const processed: RawItem[] = [];

    const summary = await runStage3(
      baseDeps([entry("cncf-lfx", source, { sink: "calendar" })], {
        processItem: async (i) => {
          processed.push(i);
          return { ok: true, errors: [] };
        },
      })
    );

    expect(processed).toEqual([]);
    expect(summary.prerank).toBeNull();
    expect(summary.sources[0].errors[0]).toMatch(/D18: dropped 1 item/);
  });

  it("routes calendarEntries from a pipeline-sink source too (that direction is safe)", async () => {
    const source = fakeSource({
      name: "mixed",
      items: [item("a", "kubernetes engineer role here")],
      calendarEntries,
    });
    let written: CalendarEntry[] = [];
    const summary = await runStage3(
      baseDeps([entry("mixed", source)], {
        writeCalendar: (e) => {
          written = e;
          return { written: e.length, refused: [] };
        },
      })
    );
    expect(written).toEqual(calendarEntries);
    expect(summary.sources[0].fetched).toBe(1);
  });

  it("does not touch the calendar writer when nothing produced an entry", async () => {
    let called = false;
    await runStage3(
      baseDeps([entry("feed", fakeSource({ name: "feed" }))], {
        writeCalendar: () => {
          called = true;
          return { written: 0, refused: [] };
        },
      })
    );
    expect(called).toBe(false);
  });
});

// ============================================================
// 3. Prerank wiring
// ============================================================

describe("prerank wiring", () => {
  it("splits a batch larger than maxPerRun and attributes both sides per source", async () => {
    const a = fakeSource({
      name: "a",
      items: [
        item("a1", "kubernetes ebpf observability engineer platform"),
        item("a2", "kubernetes ebpf engineer"),
      ],
    });
    const b = fakeSource({
      name: "b",
      items: [item("b1", "kubernetes engineer"), item("b2", "some unrelated marketing copywriter role")],
    });

    const processed: RawItem[] = [];
    const summary = await runStage3(
      baseDeps([entry("a", a), entry("b", b)], {
        prerankConfig: { maxPerRun: 2 },
        processItem: async (i) => {
          processed.push(i);
          return { ok: true, errors: [] };
        },
      })
    );

    expect(summary.prerank).not.toBeNull();
    expect(summary.prerank?.total).toBe(4);
    expect(summary.prerank?.passed).toBe(2);
    expect(summary.prerank?.gated).toBe(2);

    // Only survivors spend pipeline budget.
    expect(processed).toHaveLength(2);

    // Per-source attribution accounts for every item exactly once.
    const totals = summary.sources.reduce(
      (acc, s) => ({ p: acc.p + s.prerankPassed, g: acc.g + s.prerankGated }),
      { p: 0, g: 0 }
    );
    expect(totals).toEqual({ p: 2, g: 2 });
    for (const s of summary.sources) {
      expect(s.prerankPassed + s.prerankGated).toBe(2);
      expect(Object.values(s.gatedByReason).reduce((n, v) => n + v, 0)).toBe(s.prerankGated);
    }
  });

  it("collapses duplicate fingerprints across sources before preranking", async () => {
    const shared = item("dup", "kubernetes engineer role description");
    const a = fakeSource({ name: "a", items: [shared] });
    // A structurally identical item from another source: same host, same text.
    const b = fakeSource({ name: "b", items: [item("dup", "kubernetes engineer role description")] });

    const summary = await runStage3(baseDeps([entry("a", a), entry("b", b)]));

    expect(summary.sources[0].deduped).toBe(0);
    expect(summary.sources[1].deduped).toBe(1);
    expect(summary.prerank?.total).toBe(1);
  });

  it("skips prerank entirely when no pipeline item was fetched", async () => {
    const summary = await runStage3(baseDeps([entry("empty", fakeSource({ name: "empty" }))]));
    expect(summary.prerank).toBeNull();
    expect(summary.sources[0].fetched).toBe(0);
  });
});

// ============================================================
// 4. Health across runs
// ============================================================

describe("health across runs", () => {
  it("two consecutive failures reach auto_disabled in the persisted store", async () => {
    const health = createMemoryHealthStore();
    const source = fakeSource({ name: "feed", health: BAD });
    const table = [entry("feed", source)];

    const first = await runStage3(baseDeps(table, { health }));
    expect(first.sources[0].health?.status).toBe("probation");
    expect(health.get("feed")?.consecutiveFailures).toBe(1);

    const second = await runStage3(baseDeps(table, { health }));
    expect(second.sources[0].health?.status).toBe("auto_disabled");
    expect(second.autoDisabled).toEqual(["feed"]);
    expect(health.get("feed")?.status).toBe("auto_disabled");
  });

  it("an auto-disabled source is skipped on the next run — probed, never fetched", async () => {
    const calls: string[] = [];
    const source = fakeSource({ name: "feed", health: BAD, items: [item("a", "kubernetes engineer")], calls });
    const health = createMemoryHealthStore(
      new Map([["feed", { ...createHealthState("feed"), status: "auto_disabled", consecutiveFailures: 2 }]])
    );

    const summary = await runStage3(baseDeps([entry("feed", source)], { health }));

    expect(summary.sources[0].status).toBe("skipped_auto_disabled");
    expect(summary.sources[0].fetched).toBe(0);
    expect(calls).toEqual(["feed:healthCheck"]); // probed, never fetched
  });

  it("a clean probe reports recovery but does NOT resume the source", async () => {
    const calls: string[] = [];
    const source = fakeSource({ name: "feed", health: OK, items: [item("a", "kubernetes engineer")], calls });
    const health = createMemoryHealthStore(
      new Map([["feed", { ...createHealthState("feed"), status: "auto_disabled", consecutiveFailures: 2 }]])
    );

    const summary = await runStage3(baseDeps([entry("feed", source)], { health }));

    expect(summary.recovered).toEqual(["feed"]);
    expect(summary.sources[0].status).toBe("skipped_auto_disabled");
    // Still no fetch: recovery is reported for the operator to act on.
    expect(calls).toEqual(["feed:healthCheck"]);
    expect(summary.sources[0].health?.recovered).toBe(true);
  });

  it("a success resets consecutiveFailures back to zero", async () => {
    const health = createMemoryHealthStore();
    const table = [entry("feed", fakeSource({ name: "feed", health: BAD }))];
    await runStage3(baseDeps(table, { health }));
    expect(health.get("feed")?.consecutiveFailures).toBe(1);

    await runStage3(baseDeps([entry("feed", fakeSource({ name: "feed", health: OK }))], { health }));
    expect(health.get("feed")?.status).toBe("healthy");
    expect(health.get("feed")?.consecutiveFailures).toBe(0);
  });

  it("flushes health exactly once per non-dry run", async () => {
    let flushes = 0;
    const health = createMemoryHealthStore(new Map(), () => {
      flushes += 1;
    });
    await runStage3(baseDeps([entry("feed", fakeSource({ name: "feed" }))], { health }));
    expect(flushes).toBe(1);
  });
});

describe("reenableSource", () => {
  it("clears an auto-disabled source's history and flushes", async () => {
    let flushed = false;
    const health = createMemoryHealthStore(
      new Map([["feed", { ...createHealthState("feed"), status: "auto_disabled", consecutiveFailures: 2 }]]),
      () => {
        flushed = true;
      }
    );

    const result = reenableSource("feed", health);
    expect(result).toEqual({ name: "feed", found: true, previousStatus: "auto_disabled", reset: true });
    expect(health.get("feed")).toEqual(createHealthState("feed"));
    expect(flushed).toBe(true);
  });

  it("reports an unknown source instead of inventing state for it", () => {
    const health = createMemoryHealthStore();
    expect(reenableSource("nope", health)).toEqual({
      name: "nope",
      found: false,
      previousStatus: null,
      reset: false,
    });
    expect(health.all()).toEqual([]);
  });

  it("lets a re-enabled source fetch again on the next run", async () => {
    const calls: string[] = [];
    const health = createMemoryHealthStore(
      new Map([["feed", { ...createHealthState("feed"), status: "auto_disabled", consecutiveFailures: 2 }]])
    );
    reenableSource("feed", health);

    const summary = await runStage3(
      baseDeps([entry("feed", fakeSource({ name: "feed", items: [item("a", "kubernetes engineer")], calls }))], {
        health,
      })
    );

    expect(summary.sources[0].status).toBe("ran");
    expect(calls).toContain("feed:fetch");
  });
});

// ============================================================
// 5. Dry run
// ============================================================

describe("dry run", () => {
  it("fetches and preranks but persists absolutely nothing", async () => {
    const calls: string[] = [];
    const source = fakeSource({
      name: "feed",
      items: [item("a", "kubernetes engineer"), item("b", "ebpf observability engineer")],
      calendarEntries: [{ title: "T", date: null, url: "https://x.test/t", description: null }],
      calls,
    });

    let processCalls = 0;
    let calendarCalls = 0;
    let flushes = 0;
    let healthWrites = 0;

    const inner = createMemoryHealthStore(new Map(), () => {
      flushes += 1;
    });
    const health = {
      ...inner,
      set: (name: string, state: Parameters<typeof inner.set>[1]) => {
        healthWrites += 1;
        inner.set(name, state);
      },
    };

    const summary = await runStage3(
      baseDeps([entry("feed", source)], {
        dryRun: true,
        health,
        processItem: async () => {
          processCalls += 1;
          return { ok: true, errors: [] };
        },
        writeCalendar: () => {
          calendarCalls += 1;
          return { written: 1, refused: [] };
        },
      })
    );

    // It really did the read-only work.
    expect(calls).toEqual(["feed:fetch", "feed:healthCheck"]);
    expect(summary.dryRun).toBe(true);
    expect(summary.sources[0].fetched).toBe(2);
    expect(summary.prerank?.total).toBe(2);
    expect(summary.sources[0].health?.status).toBe("healthy");

    // …and wrote nothing, anywhere.
    expect(processCalls).toBe(0);
    expect(calendarCalls).toBe(0);
    expect(healthWrites).toBe(0);
    expect(flushes).toBe(0);
    expect(summary.calendar).toBeNull();
    expect(summary.sources[0].written).toBe(0);
  });
});

// ============================================================
// 6. Config toggles (D14) — two independent levels
// ============================================================

describe("source table toggles", () => {
  it("a disabled family is skipped entirely — never built, never fetched", async () => {
    const calls: string[] = [];
    const source = fakeSource({ name: "off", items: [item("a", "kubernetes engineer")], calls });
    let built = 0;

    const summary = await runStage3(
      baseDeps([
        {
          name: "off",
          enabled: false,
          sink: "pipeline",
          family: "atom_feed",
          build: () => {
            built += 1;
            return source;
          },
        },
      ])
    );

    expect(summary.sources[0].status).toBe("skipped_disabled");
    expect(built).toBe(0);
    expect(calls).toEqual([]);
    expect(summary.sources[0].health).toBeNull();
  });

  it("a disabled company entry is skipped inside an enabled family", async () => {
    const fetchedTokens: string[] = [];
    const adapter: CompanyBoardAdapter = {
      platform: "fakehouse",
      fetchOne: async (registryEntry) => {
        fetchedTokens.push(registryEntry.token);
        return [item(registryEntry.token, "kubernetes engineer role")];
      },
    };
    const registry: CompanyRegistryEntry[] = [
      { company: "On Inc", platform: "fakehouse", token: "on", enabled: true },
      { company: "Off Inc", platform: "fakehouse", token: "off", enabled: false },
    ];

    const summary = await runStage3(
      baseDeps([
        {
          name: "fakehouse",
          enabled: true,
          sink: "pipeline",
          family: "company_board",
          build: () => createCompanyBoardSource(adapter, registry, true),
        },
      ])
    );

    // Only the enabled company was fetched — twice, because healthCheck
    // re-fetches the registry by design (Wave 2, family-level health).
    expect(new Set(fetchedTokens)).toEqual(new Set(["on"]));
    expect(summary.sources[0].fetched).toBe(1);
    expect(summary.sources[0].health?.status).toBe("healthy");
  });
});

// ============================================================
// 7. Summary shape
// ============================================================

describe("run summary", () => {
  it("holds one run timestamp and reports every selected source", async () => {
    const summary = await runStage3(
      baseDeps([
        entry("a", fakeSource({ name: "a", items: [item("a", "kubernetes engineer")] })),
        entry("b", fakeSource({ name: "b" }), { enabled: false }),
      ])
    );

    expect(summary.runTimestamp).toBe(NOW);
    expect(summary.sources).toHaveLength(2);
    expect(summary.autoDisabled).toEqual([]);
    expect(summary.recovered).toEqual([]);
  });
});
