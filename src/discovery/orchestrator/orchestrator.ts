// orchestrator.ts
// File: src/discovery/orchestrator/orchestrator.ts
// Purpose: The Stage-3 run coordinator (Phase 1 Wave 6). Iterates the selected
//          source-table rows, fetches each, routes calendar entries to the
//          calendar writer and pipeline items to the prerank gate, hands the
//          survivors to the full pipeline, advances and persists health state,
//          and returns one human-readable run summary.
//
// Every side effect is injected (Stage3RunDeps), so the whole coordinator is
// exercised in tests with fake HTTP, a memory health store, a fake calendar
// sink, and a fake processItem — no network, no Airtable, no Gemini, no disk.
//
// ── Invariants this module is responsible for ───────────────────────────────
//  1. PER-SOURCE ISOLATION. One source throwing — from build(), fetch(), or
//     healthCheck() — never aborts the run. Wave 2 made partial failure a
//     result inside a family; this holds the same line across families.
//  2. D18. A `sink: "calendar"` row's RawItems never reach normalize() or
//     runPipeline(). Enforced, not merely observed: if such a source starts
//     emitting items after a format change, they are dropped and reported.
//  3. HEALTH IS ONE-WAY WITHOUT THE OPERATOR. An auto_disabled source is
//     probed with healthCheck() only, never fetch(). Recovery is reported,
//     never acted on — resuming requires `--reenable`.
//  4. A DRY RUN PERSISTS NOTHING. No pipeline run, no calendar write, no
//     health write.

import { normalize } from "../../engines/normalization";
import type { RawItem } from "../../engines/normalization/types";
import { prerank } from "../prerank";
import type { GateReason, GatedItem } from "../prerank/types";
import { advanceHealth, createHealthState } from "../stage3/health";
import type {
  CalendarEntry,
  HealthCheckResult,
  SourceDeps,
  SourceHealthState,
  Stage3Source,
} from "../stage3/types";
import type {
  HealthStore,
  SourceRunSummary,
  SourceTableEntry,
  Stage3RunDeps,
  Stage3RunSummary,
} from "./types";

// ============================================================
// Helpers
// ============================================================

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A blank per-source row, filled in as the run proceeds. */
function emptySummary(entry: SourceTableEntry): SourceRunSummary {
  return {
    name: entry.name,
    family: entry.family,
    sink: entry.sink,
    status: "ran",
    fetched: 0,
    calendarRouted: 0,
    deduped: 0,
    prerankPassed: 0,
    prerankGated: 0,
    gatedByReason: {},
    written: 0,
    errors: [],
    health: null,
  };
}

/**
 * Run a source's healthCheck without letting it throw. A source that throws
 * out of healthCheck is, by definition, unhealthy — record it as a failed
 * check rather than losing the whole run to it.
 */
async function safeHealthCheck(source: Stage3Source, deps: SourceDeps): Promise<HealthCheckResult> {
  try {
    return await source.healthCheck(deps);
  } catch (err) {
    return { ok: false, checkedAt: deps.now(), detail: `healthCheck threw: ${message(err)}` };
  }
}

/** Advance + record health for one source, persisting unless this is a dry run. */
function recordHealth(
  entry: SourceTableEntry,
  previous: SourceHealthState,
  result: HealthCheckResult,
  health: HealthStore,
  dryRun: boolean,
  summary: SourceRunSummary
): SourceHealthState {
  const next = advanceHealth(previous, result);
  if (!dryRun) health.set(entry.name, next);
  summary.health = {
    status: next.status,
    consecutiveFailures: next.consecutiveFailures,
    detail: result.detail,
    recovered: next.recoveredFromDisabled,
  };
  return next;
}

// ============================================================
// Run
// ============================================================

/**
 * Execute one Stage-3 discovery run over `deps.entries`.
 *
 * Prerank runs ONCE over the whole run's combined batch, not per source: its
 * IDF weighting is defined over "the current run's full batch", and
 * `maxPerRun` is the run's Gemini budget, not a per-source quota. Passed and
 * gated counts are attributed back to the owning source by item identity
 * (prerank returns the same RawItem references it was given).
 *
 * Never throws for a source-level failure; only a caller mistake (e.g. a
 * prerank accounting-invariant violation) propagates.
 */
export async function runStage3(deps: Stage3RunDeps): Promise<Stage3RunSummary> {
  const { entries, sourceDeps, vocabulary, prerankConfig, health, writeCalendar, processItem, buildContext, dryRun } =
    deps;

  const runTimestamp = sourceDeps.now();
  const summaries: SourceRunSummary[] = [];
  const byName = new Map<string, SourceRunSummary>();

  // Run-wide accumulators.
  const pipelineItems: RawItem[] = [];
  const owner = new Map<RawItem, string>();
  const seenFingerprints = new Set<string>();
  const calendarEntries: CalendarEntry[] = [];

  // ── 1. Fetch every selected source ────────────────────────────────────────
  for (const entry of entries) {
    const summary = emptySummary(entry);
    summaries.push(summary);
    byName.set(entry.name, summary);

    if (!entry.enabled) {
      summary.status = "skipped_disabled";
      continue;
    }

    let source: Stage3Source;
    try {
      source = entry.build(buildContext);
    } catch (err) {
      summary.status = "build_error";
      summary.errors.push(`build failed: ${message(err)}`);
      continue;
    }

    const previous = health.get(entry.name) ?? createHealthState(entry.name);

    // Auto-disabled: probe with healthCheck ONLY. Never fetch, never persist
    // items — but do let a recovery be seen, so the operator learns the source
    // is back and can decide to `--reenable` it.
    if (previous.status === "auto_disabled") {
      summary.status = "skipped_auto_disabled";
      const probe = await safeHealthCheck(source, sourceDeps);
      recordHealth(entry, previous, probe, health, dryRun, summary);
      continue;
    }

    let fetched;
    try {
      fetched = await source.fetch(sourceDeps);
    } catch (err) {
      // A family should return errors rather than throw; if one does throw,
      // isolate it here rather than losing every remaining source.
      fetched = { items: [], errors: [{ scope: entry.name, kind: "http" as const, detail: message(err) }] };
    }

    summary.fetched = fetched.items.length;
    for (const e of fetched.errors) {
      summary.errors.push(`${e.scope} [${e.kind}] ${e.detail}`);
    }

    // Calendar entries are routed regardless of sink: calendar output is
    // human-read and never re-enters the pipeline, so this direction is safe.
    const produced = fetched.calendarEntries ?? [];
    if (produced.length > 0) {
      calendarEntries.push(...produced);
      summary.calendarRouted = produced.length;
    }

    if (entry.sink === "calendar") {
      // D18, enforced: a calendar-sink source's items never reach the pipeline.
      if (fetched.items.length > 0) {
        summary.errors.push(
          `D18: dropped ${fetched.items.length} item(s) — a calendar-sink source's items never enter the pipeline`
        );
      }
    } else {
      for (const item of fetched.items) {
        let fingerprint: string;
        try {
          fingerprint = normalize(item).fingerprint;
        } catch (err) {
          summary.errors.push(`normalize failed for one item: ${message(err)}`);
          continue;
        }
        if (seenFingerprints.has(fingerprint)) {
          summary.deduped += 1;
          continue;
        }
        seenFingerprints.add(fingerprint);
        owner.set(item, entry.name);
        pipelineItems.push(item);
      }
    }

    const checked = await safeHealthCheck(source, sourceDeps);
    recordHealth(entry, previous, checked, health, dryRun, summary);
  }

  // ── 2. Prerank the whole run's batch at once ──────────────────────────────
  let prerankSummary: Stage3RunSummary["prerank"] = null;
  let survivors: RawItem[] = [];

  if (pipelineItems.length > 0) {
    const result = prerank(
      { items: pipelineItems, vocabulary, config: prerankConfig },
      { now: () => runTimestamp }
    );
    survivors = result.passed;

    for (const item of result.passed) {
      const s = byName.get(owner.get(item) ?? "");
      if (s) s.prerankPassed += 1;
    }
    for (const g of result.gated as GatedItem[]) {
      const s = byName.get(owner.get(g.item) ?? "");
      if (!s) continue;
      s.prerankGated += 1;
      const reason: GateReason = g.reason;
      s.gatedByReason[reason] = (s.gatedByReason[reason] ?? 0) + 1;
    }

    prerankSummary = {
      total: result.stats.total,
      passed: result.stats.passed,
      gated: result.stats.gated,
      gatedByReason: result.stats.gatedByReason,
    };
  }

  // ── 3. Pipeline the survivors ─────────────────────────────────────────────
  if (!dryRun) {
    for (const item of survivors) {
      const s = byName.get(owner.get(item) ?? "");
      try {
        const outcome = await processItem(item);
        if (outcome.ok && s) s.written += 1;
        if (s) s.errors.push(...outcome.errors);
      } catch (err) {
        // Per-item isolation: each survivor is an independent write. One
        // failure must not strand the rest of the batch.
        if (s) s.errors.push(`pipeline failed for one item: ${message(err)}`);
      }
    }
  }

  // ── 4. Calendar sink (D18) ────────────────────────────────────────────────
  let calendar: Stage3RunSummary["calendar"] = null;
  if (!dryRun && calendarEntries.length > 0) {
    calendar = writeCalendar(calendarEntries);
  }

  // ── 5. Persist health ─────────────────────────────────────────────────────
  if (!dryRun) health.flush();

  const autoDisabled: string[] = [];
  const recovered: string[] = [];
  for (const s of summaries) {
    if (!s.health) continue;
    if (s.health.status === "auto_disabled") autoDisabled.push(s.name);
    if (s.health.recovered) recovered.push(s.name);
  }

  return { dryRun, runTimestamp, sources: summaries, prerank: prerankSummary, calendar, autoDisabled, recovered };
}

// ============================================================
// Operator re-enable (Q3a ruling)
// ============================================================

export interface ReenableResult {
  name: string;
  /** False when the source had no recorded health state at all. */
  found: boolean;
  /** The status the source was in before the reset. */
  previousStatus: SourceHealthState["status"] | null;
  /** True when a state was actually reset and flushed. */
  reset: boolean;
}

/**
 * Clear a source's health history so it resumes on the next run. This is the
 * ONLY way out of auto_disabled — a clean check reports recovery but never
 * resumes the source by itself (Wave 2's design: re-enable is the operator's
 * call).
 */
export function reenableSource(name: string, health: HealthStore): ReenableResult {
  const previous = health.get(name);
  if (!previous) return { name, found: false, previousStatus: null, reset: false };

  health.set(name, createHealthState(name));
  health.flush();
  return { name, found: true, previousStatus: previous.status, reset: true };
}
