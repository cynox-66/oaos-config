// types.ts
// File: src/discovery/stage3/types.ts
// Purpose: Shared contract for every Stage-3 source family — the uniform
//          Stage3Source surface, injected SourceDeps, the health-check state
//          machine types, and the per-family config/adapter shapes. No
//          fetching, parsing logic, or I/O lives in this file.

import type { RawItem } from "../../engines/normalization/types";
import type { IngestionType } from "../../engines/source-admission/types";

// ============================================================
// Common source contract
// ============================================================

export type StageSourceFamily = "company_board" | "github_repo" | "atom_feed";

export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * Every dependency a source needs to do network I/O, injected by the
 * caller. Real HTTP is wired in Wave 6; tests always inject fakes. No
 * source module in this tree imports fetch/http directly.
 */
export interface SourceDeps {
  httpGet: (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;
  httpPost: (url: string, body: unknown, headers?: Record<string, string>) => Promise<HttpResponse>;
  /** Returns the current time as ISO-8601. Injected for determinism. */
  now: () => string;
}

export type SourceErrorKind = "http" | "parse" | "shape";

export interface SourceError {
  /** Which registry entry / feed entry failed, e.g. "greenhouse:tailscale". */
  scope: string;
  kind: SourceErrorKind;
  detail: string;
}

export interface FetchResult {
  items: RawItem[];
  /** Partial failure is a result, never a thrown total-stop. */
  errors: SourceError[];
  /** Populated only by atom_feed sources routed to the calendar sink. */
  calendarEntries?: CalendarEntry[];
}

export interface HealthCheckResult {
  ok: boolean;
  /** From deps.now. */
  checkedAt: string;
  /** Human-readable; goes into the weekly report verbatim. */
  detail: string;
}

export interface Stage3Source {
  /** Machine name — family name for multi-entry families, e.g. "greenhouse". */
  name: string;
  family: StageSourceFamily;
  /** D14 toggle, sourced from per-source config — never hardcoded. */
  enabled: boolean;
  fetch(deps: SourceDeps): Promise<FetchResult>;
  healthCheck(deps: SourceDeps): Promise<HealthCheckResult>;
}

// ============================================================
// Health state machine (Engine 11's has_health_check semantics)
// ============================================================

export type SourceHealthStatus = "healthy" | "probation" | "auto_disabled";

export interface SourceHealthState {
  source: string;
  /** Capped at MAX_CONSECUTIVE_FAILURES. */
  consecutiveFailures: number;
  status: SourceHealthStatus;
  lastResult: HealthCheckResult | null;
  /**
   * True only on the advance that recovers from auto_disabled; cleared on
   * the very next advance (success or failure). The orchestrator reads this
   * to require an operator's manual re-enable rather than silently resuming.
   */
  recoveredFromDisabled: boolean;
}

// ============================================================
// company_board family
// ============================================================

export interface CompanyRegistryEntry {
  /** Display name, e.g. "Grafana Labs". */
  company: string;
  /** "greenhouse" | "lever" | "workday" | "ashby" | (extensible, Wave 7). */
  platform: string;
  /** Board token / tenant identifier. */
  token: string;
  /** Workday needs tenant+site; optional for others. */
  site?: string;
  /** Per-company toggle, independent of the family-level toggle. */
  enabled: boolean;
}

/**
 * Maps one registry entry to zero or more RawItems. Concrete platform
 * adapters (Greenhouse, Lever, Workday, Ashby, ...) are Wave 3.
 */
export interface CompanyBoardAdapter {
  platform: string;
  fetchOne(entry: CompanyRegistryEntry, deps: SourceDeps): Promise<RawItem[]>;
}

// ============================================================
// github_repo family
// ============================================================

export interface RepoSourceConfig {
  owner: string;
  repo: string;
  /** Directory to list via the Contents API. */
  path: string;
  enabled: boolean;
}

export interface ContentsApiEntry {
  name: string;
  path: string;
  type: string;
  sha: string;
  download_url: string | null;
}

/** Turns a directory listing into RawItems. Per-program interpretation is Wave 4. */
export interface RepoAdapter {
  interpretEntries(entries: ContentsApiEntry[], config: RepoSourceConfig, deps: SourceDeps): RawItem[];
}

// ============================================================
// atom_feed family
// ============================================================

export interface FeedSourceConfig {
  url: string;
  /** Outreachy is calendar; NLnet is pipeline — routing exists now, the
   *  calendar writer is Wave 4. */
  sink: "pipeline" | "calendar";
  enabled: boolean;
}

export interface FeedEntry {
  id: string;
  title: string;
  updated: string | null;
  link: string | null;
  content: string | null;
}

/** Consumed by Wave 4's calendar writer. Defined and returned here; written nowhere. */
export interface CalendarEntry {
  title: string;
  date: string | null;
  url: string | null;
  description: string | null;
}

export interface FeedPipelineAdapter {
  toRawItem(entry: FeedEntry, config: FeedSourceConfig, deps: SourceDeps): RawItem;
}

// ============================================================
// Engine 11 admission scaffolding
// ============================================================

/**
 * Metadata a Stage3Source module declares about itself, mapped 1:1 into
 * Engine 11's real SourceProposal by buildSourceProposal(). has_health_check,
 * dedupe_compatible, and survives_format_change are NOT here — they default
 * true in buildSourceProposal because the Stage3Source contract makes them
 * true by construction (every source has healthCheck(); FetchResult.errors
 * makes format-change survival structural). See the README before reusing
 * those defaults outside this contract.
 */
export interface SourceMeta {
  name: string;
  ingestion_method: IngestionType;
  auth_required: boolean;
  est_volume_per_week: number;
  est_maint_min_per_week: number;
  /** Defaults to 0. */
  cost_per_month_inr?: number;
  /** Required by Engine 11 only when cost_per_month_inr > 0. */
  justification?: string;
}
