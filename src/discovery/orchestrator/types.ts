// types.ts
// File: src/discovery/orchestrator/types.ts
// Purpose: Types for the Stage-3 run coordinator (Phase 1 Wave 6) — the source
//          table the operator edits, the injected run dependencies, the health
//          store surface, and the per-source / per-run summary shapes.
//          No I/O, no network, no logic lives in this file.

import type { RawItem } from "../../engines/normalization/types";
import type { PrerankConfig, PrerankVocabulary } from "../prerank/types";
import type {
  CalendarEntry,
  SourceDeps,
  SourceHealthState,
  SourceHealthStatus,
  Stage3Source,
  StageSourceFamily,
} from "../stage3/types";

// ============================================================
// Source table (operator-edited config — D14)
// ============================================================

/**
 * Everything a source needs at construction time that is not baked into its
 * own config module. Currently just the optional GitHub token used by the
 * github_repo family to lift the unauthenticated Contents-API rate limit.
 */
export interface SourceBuildContext {
  githubToken?: string;
}

/**
 * One row of the Stage-3 source table. The table — not `Stage3Source.name` —
 * owns the friendly name, because the frame derives names like
 * `atom:https://nlnet.nl/feed.atom` that are unusable as a CLI argument or a
 * health-state key.
 */
export interface SourceTableEntry {
  /** Friendly, stable name. The `--source` argument and the health-state key. */
  name: string;
  /** D14 family-level toggle. The operator edits this; nothing else writes it. */
  enabled: boolean;
  /**
   * Where this source's RawItems go. `"calendar"` sources never contribute
   * items to the opportunity pipeline — the D18 boundary, enforced here rather
   * than merely observed, so a source that starts emitting items after a
   * format change cannot silently cross it.
   *
   * Note this governs ITEMS only. `FetchResult.calendarEntries` is always
   * routed to the calendar writer regardless of sink: calendar output is
   * human-read and never re-enters the pipeline, so that direction is safe.
   */
  sink: "pipeline" | "calendar";
  /** Declared for the run summary; the built source's own family must match. */
  family: StageSourceFamily;
  /** Constructs the source. May throw; a throw is reported, never fatal. */
  build(ctx: SourceBuildContext): Stage3Source;
}

// ============================================================
// Health store
// ============================================================

/**
 * Persistence surface for {@link SourceHealthState}, injected so the
 * orchestrator never touches disk in tests. The real implementation is
 * `createHealthStore()` over `discovery/health.json`.
 */
export interface HealthStore {
  get(name: string): SourceHealthState | undefined;
  set(name: string, state: SourceHealthState): void;
  all(): SourceHealthState[];
  /** Write through to the backing store. Never called during a dry run. */
  flush(): void;
}

// ============================================================
// Run inputs
// ============================================================

/** Outcome of persisting one preranked item through the full pipeline. */
export type ProcessStage3Item = (item: RawItem) => Promise<{ ok: boolean; errors: string[] }>;

/** Result shape of the injected calendar sink (matches CalendarWriteResult). */
export interface CalendarSinkResult {
  written: number;
  refused: { entry: CalendarEntry; reason: string }[];
}

export interface Stage3RunDeps {
  /** The rows to consider this run — the CLI has already applied selection. */
  entries: SourceTableEntry[];
  /** Real HTTP + clock. Constructed only in orchestrator/http.ts. */
  sourceDeps: SourceDeps;
  /**
   * Prerank vocabulary. Required — the orchestrator never reads
   * preferences.json itself, keeping prerank's no-file-reads rule intact and
   * every test disk-free. The CLI loads it and refuses to run without it.
   */
  vocabulary: PrerankVocabulary;
  /** Merged over DEFAULT_PRERANK_CONFIG by the prerank module. */
  prerankConfig?: Partial<PrerankConfig>;
  health: HealthStore;
  /** Real implementation is `writeCalendarEntries` (D18). */
  writeCalendar: (entries: CalendarEntry[]) => CalendarSinkResult;
  /** normalize → runPipeline → persist, for every preranked survivor. */
  processItem: ProcessStage3Item;
  buildContext: SourceBuildContext;
  /**
   * Fetch, prerank, and report — persist nothing. No pipeline run, no calendar
   * write, no health write. The operator's consequence-free sanity check.
   */
  dryRun: boolean;
}

// ============================================================
// Run summary
// ============================================================

export type SourceRunStatus =
  | "ran"
  | "skipped_disabled"
  | "skipped_auto_disabled"
  | "build_error";

export interface SourceHealthSummary {
  status: SourceHealthStatus;
  consecutiveFailures: number;
  /** The last check's detail, carried verbatim into `oaos report`. */
  detail: string;
  /** Recovered from auto_disabled on this advance — needs `--reenable`. */
  recovered: boolean;
}

export interface SourceRunSummary {
  name: string;
  family: StageSourceFamily;
  sink: "pipeline" | "calendar";
  status: SourceRunStatus;
  /** RawItems returned by fetch(). */
  fetched: number;
  /** CalendarEntries handed to the calendar writer. */
  calendarRouted: number;
  /** Items dropped as within-run duplicate fingerprints. */
  deduped: number;
  prerankPassed: number;
  prerankGated: number;
  /** Zero-filled for every GateReason present in this source's gated items. */
  gatedByReason: Record<string, number>;
  /** Pipeline items persisted successfully. Always 0 in a dry run. */
  written: number;
  errors: string[];
  /** Null when the source was skipped as disabled or failed to build. */
  health: SourceHealthSummary | null;
}

export interface Stage3RunSummary {
  dryRun: boolean;
  /** From sourceDeps.now(), held for the whole run. */
  runTimestamp: string;
  sources: SourceRunSummary[];
  /** Run-wide prerank counters; null when no pipeline-sink item was fetched. */
  prerank: {
    total: number;
    passed: number;
    gated: number;
    gatedByReason: Record<string, number>;
  } | null;
  /** Null in a dry run, or when no calendar entry was produced. */
  calendar: CalendarSinkResult | null;
  /** Sources currently in auto_disabled after this run. */
  autoDisabled: string[];
  /** Sources that recovered this run and await an explicit `--reenable`. */
  recovered: string[];
}
