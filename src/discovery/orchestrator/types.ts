// types.ts
// File: src/discovery/orchestrator/types.ts
// Purpose: Types for the Stage-3 run coordinator (Phase 1 Wave 6) — the source
//          table the operator edits, the injected run dependencies, the health
//          store surface, and the per-source / per-run summary shapes.
//          No I/O, no network, no logic lives in this file.

import type { RawItem } from "../../engines/normalization/types";
import type { PrerankConfig, PrerankVocabulary } from "../prerank/types";
import type { GeoPreference, Preferences } from "../scope/types";
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
 * own config module.
 *
 * THIS IS HOW CONFIRMED SCOPE REACHES A SOURCE (Wave 5 Q2 ruling). Sources
 * never read files — the CLI loads preferences.json exactly once, for both the
 * prerank vocabulary and this field, and passes the loaded object through. No
 * second loader, no disk access in a source or in the orchestrator, and the
 * Wave 6 rule "no preferences.json ⇒ no Stage 3" is inherited for free.
 *
 * Every field is optional so the 10 pre-Wave-5 rows keep building unchanged;
 * a source that REQUIRES one throws at build time, and the orchestrator
 * reports that as `build_error` without aborting the run.
 */
export interface SourceBuildContext {
  /** Lifts the github_repo family's unauthenticated Contents-API rate limit. */
  githubToken?: string;
  /** The operator's confirmed discovery scope (D15). Drives query_net sources. */
  preferences?: Preferences;
  /** From ADZUNA_APP_ID — never read from disk by a source module. */
  adzunaAppId?: string;
  /** From ADZUNA_APP_KEY. */
  adzunaAppKey?: string;
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
  /**
   * The operator's confirmed geo eligibility (v3). `null` means a confirmed
   * `geo off`; `undefined` is treated identically (filter disabled) so every
   * pre-G1 caller and test keeps its exact behaviour. Like `vocabulary`, the
   * orchestrator never reads preferences.json — the CLI loads and passes.
   */
  geo?: GeoPreference | null;
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
  /** Items gated as geo-ineligible before prerank (0 when the filter is off). */
  geoIneligible: number;
  /** Items whose geo could not be parsed by a mapper that ran. Counted under
   *  BOTH policies; whether they proceeded is the run-level policy field. */
  geoUnresolved: number;
  /** Items from a source with no geo mapper — always proceed (ruling Q2). */
  geoUnknownSource: number;
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
  /** Run-wide geo-filter counters; null when the filter is off (no confirmed
   *  geo scope) or when no pipeline-sink item was fetched. */
  geo: {
    total: number;
    eligible: number;
    ineligible: number;
    unresolved: number;
    /** The policy applied to `unresolved` this run. */
    unresolvedPolicy: "pass" | "gate";
    unknownSource: number;
    /** Source-table names whose items went through unmapped — named so the
     *  operator sees WHICH sources bypass geo filtering (ruling Q2). */
    unknownSources: string[];
  } | null;
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
