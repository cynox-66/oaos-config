// sources.ts
// File: src/discovery/orchestrator/sources.ts
// Purpose: THE STAGE-3 SOURCE TABLE (D14) — the single place declaring every
//          Stage-3 source and whether it is switched on. This is the file the
//          operator edits to activate a source.
//
// ── How to toggle a source ──────────────────────────────────────────────────
//   Flip `enabled` on the row below. That's the whole procedure. `enabled`
//   governs `oaos discover --stage3 --all-enabled`.
//
//   `--source <name>` deliberately BYPASSES this toggle: naming a source on
//   the command line IS the operator's activation gesture for that one
//   invocation. The toggle answers "what runs when I ask for everything",
//   not "what am I allowed to run".
//
// ── Two levels of toggle for company boards ─────────────────────────────────
//   Each of the four company_board platforms is its own row here (so a
//   Greenhouse outage cannot auto-disable Ashby). The per-COMPANY toggle lives
//   in src/discovery/stage3/registry.ts. A company entry disabled there is
//   skipped even when its platform row is enabled here.
//
// ── Shipped default: every row is `enabled: false` ──────────────────────────
//   Locked operator decision, 2026-07-28. Wave 6 builds the ABILITY to run;
//   deciding what actually runs is Wave 8 and is operator-paced. Nothing in
//   this repo flips these for you.

import { greenhouseAdapter } from "../stage3/adapters/greenhouse";
import { leverAdapter } from "../stage3/adapters/lever";
import { workdayAdapter } from "../stage3/adapters/workday";
import { ashbyAdapter } from "../stage3/adapters/ashby";
import { COMPANY_REGISTRY } from "../stage3/registry";
import { createCompanyBoardSource } from "../stage3/company-board";
import { createEsocSource } from "../stage3/sources/esoc";
import { createNlnetSource } from "../stage3/sources/nlnet";
import { createGhslSource } from "../stage3/sources/ghsl";
import { createCncfLfxSource } from "../stage3/sources/cncf-lfx";
import { createLfdtSource } from "../stage3/sources/lfdt";
import { createOutreachySource } from "../stage3/sources/outreachy";
import { createHimalayasSource } from "../stage3/sources/himalayas";
import { createFreehireSource } from "../stage3/sources/freehire";
import { createAdzunaSource } from "../stage3/sources/adzuna";
import { createRemotiveSource } from "../stage3/sources/remotive";
import { createHnHiringSource } from "../stage3/sources/hn-hiring";
import { createRemotiveStore } from "../stage3/query/remotive-state";
import type { CompanyBoardAdapter } from "../stage3/types";
import type { SourceTableEntry } from "./types";

/**
 * A company_board row: one platform adapter over ITS SLICE of the registry.
 *
 * The slice is load-bearing. `createCompanyBoardSource` hands every entry it
 * is given to `adapter.fetchOne` without checking `entry.platform` — passing
 * the whole registry makes each adapter fetch every other platform's company
 * against its own API. Live-caught 2026-07-28: the Ashby row fetched all six
 * non-Ashby tokens and collected five spurious 404 SourceErrors, which would
 * have driven the family's health check toward auto_disabled for no reason.
 * Do not drop the filter.
 */
function boardEntry(adapter: CompanyBoardAdapter, enabled: boolean): SourceTableEntry {
  const registry = COMPANY_REGISTRY.filter((e) => e.platform === adapter.platform);
  return {
    name: adapter.platform,
    enabled,
    sink: "pipeline",
    family: "company_board",
    // The frame's own `enabled` is always true: the table row above owns the
    // family-level toggle, and the registry owns the per-company toggle.
    build: () => createCompanyBoardSource(adapter, registry, true),
  };
}

export const STAGE3_SOURCES: SourceTableEntry[] = [
  // ── company_board (Wave 3) ────────────────────────────────────────────────
  boardEntry(greenhouseAdapter, true),
  boardEntry(leverAdapter, false),
  boardEntry(workdayAdapter, false),
  boardEntry(ashbyAdapter, false),

  // ── github_repo / atom_feed → pipeline (Wave 4) ───────────────────────────
  {
    name: "esoc",
    enabled: false,
    sink: "pipeline",
    family: "github_repo",
    build: (ctx) => createEsocSource(undefined, () => ctx.githubToken),
  },
  {
    name: "nlnet",
    enabled: false,
    sink: "pipeline",
    family: "atom_feed",
    build: () => createNlnetSource(),
  },
  {
    // Verified-mechanism / dormant-content source: the feed is valid but
    // currently publishes 0 entries. 0 items is expected, not a failure.
    name: "ghsl",
    enabled: false,
    sink: "pipeline",
    family: "atom_feed",
    build: () => createGhslSource(),
  },

  // ── calendar sinks (D18) — items never enter the pipeline ─────────────────
  {
    name: "cncf-lfx",
    enabled: false,
    sink: "calendar",
    family: "github_repo",
    build: (ctx) => createCncfLfxSource(undefined, () => ctx.githubToken),
  },
  {
    name: "lfdt",
    enabled: false,
    sink: "calendar",
    family: "github_repo",
    build: (ctx) => createLfdtSource(undefined, () => ctx.githubToken),
  },
  {
    name: "outreachy",
    enabled: false,
    sink: "calendar",
    family: "atom_feed",
    build: () => createOutreachySource(),
  },

  // ── query_net → pipeline (Wave 5) ─────────────────────────────────────────
  // These build their requests from the operator's CONFIRMED scope, handed in
  // via `ctx.preferences`. Each throws at build time without it, which the
  // orchestrator reports as `build_error` without aborting the run.
  //
  // Request cost per run, at the operator's 13 enabled fields:
  //   himalayas 13 + 1 probe, freehire 13 + 1, adzuna 13 + 1,
  //   remotive 1 (hard-capped, 0 on a second same-day run) + 0,
  //   hn-hiring 2 + 1  →  47 requests with every row enabled.
  {
    name: "himalayas",
    enabled: false,
    sink: "pipeline",
    family: "query_net",
    build: (ctx) => createHimalayasSource(undefined, ctx.preferences),
  },
  {
    name: "freehire",
    enabled: false,
    sink: "pipeline",
    family: "query_net",
    build: (ctx) => createFreehireSource(undefined, ctx.preferences),
  },
  {
    // Credentials are optional at build time on purpose: without them the
    // source reports a clear error rather than failing to build, so a missing
    // env var does not read like a broken source.
    name: "adzuna",
    enabled: false,
    sink: "pipeline",
    family: "query_net",
    build: (ctx) =>
      createAdzunaSource(
        undefined,
        ctx.preferences,
        ctx.adzunaAppId && ctx.adzunaAppKey
          ? { appId: ctx.adzunaAppId, appKey: ctx.adzunaAppKey }
          : undefined
      ),
  },
  {
    // Scope-independent by necessity — the API has no free-text query. Hard-
    // capped at 1 call per UTC day against discovery/remotive.json.
    name: "remotive",
    enabled: false,
    sink: "pipeline",
    family: "query_net",
    build: () => createRemotiveSource(undefined, createRemotiveStore()),
  },
  {
    name: "hn-hiring",
    enabled: false,
    sink: "pipeline",
    family: "query_net",
    build: (ctx) => createHnHiringSource(undefined, ctx.preferences),
  },
];

/** Look up a table row by its friendly name. Pure. */
export function findSourceEntry(
  name: string,
  table: SourceTableEntry[] = STAGE3_SOURCES
): SourceTableEntry | undefined {
  return table.find((e) => e.name === name);
}

/** Every declared source name, in table order. Pure. */
export function sourceNames(table: SourceTableEntry[] = STAGE3_SOURCES): string[] {
  return table.map((e) => e.name);
}
