// commands/stage3.ts
// File: cli/commands/stage3.ts
// Purpose: The `oaos discover --stage3` path (Phase 1 Wave 6). Selects source-
//          table rows, loads the confirmed discovery scope, builds the real
//          SourceDeps and the real health store, runs the orchestrator, and
//          prints the run summary.
//
// Everything decision-shaped here is pure and unit-tested (selectEntries,
// parseStage3Args); the rest is thin wiring, exactly like Stage 2's
// runDiscoverCommand.

import { resolve } from "node:path";
import { normalize } from "../../src/engines/normalization";
import { runPipeline } from "../../src/pipeline";
import { createPersistence } from "../../src/persistence";
import { loadInventory } from "../../src/engines/evidence-matching/inventory";
import { createGeminiClient } from "../../src/engines/scoring/gemini";
import { loadPreferences, DEFAULT_PREFERENCES_PATH } from "../../src/discovery/scope";
import type { Preferences } from "../../src/discovery/scope/types";
import { writeCalendarEntries } from "../../src/discovery/stage3/calendar-writer";
import {
  createHealthStore,
  createSourceDeps,
  preferencesToVocabulary,
  reenableSource,
  runStage3,
  sourceNames,
  STAGE3_SOURCES,
  HEALTH_PATH,
} from "../../src/discovery/orchestrator";
import type {
  ProcessStage3Item,
  SourceTableEntry,
  Stage3RunSummary,
} from "../../src/discovery/orchestrator";
import { getFlag, hasFlag } from "../args";
import { formatGeminiStats, formatStage3Summary } from "../format";
import { getGeminiCallStats, resetGeminiCallStats } from "../../src/llm";

// ============================================================
// Argument parsing (pure)
// ============================================================

export interface Stage3Args {
  /** Run exactly this source, bypassing its table toggle. */
  source: string | null;
  /** Run every source whose table toggle is on. */
  allEnabled: boolean;
  /** Clear this source's health history. */
  reenable: string | null;
  dryRun: boolean;
}

export class Stage3ArgsError extends Error {}

const USAGE = [
  "Usage:",
  "  oaos discover --stage3 --all-enabled [--dry-run]",
  "  oaos discover --stage3 --source <name> [--dry-run]",
  "  oaos discover --stage3 --reenable <name>",
].join("\n");

/**
 * Parse the Stage-3 flags. Exactly one mode must be given — a bare `--stage3`
 * is refused rather than defaulting to a full run, because deciding what runs
 * is the operator's call (Wave 8 is operator-paced).
 *
 * @throws {Stage3ArgsError} on a missing, ambiguous, or valueless mode.
 */
export function parseStage3Args(args: string[]): Stage3Args {
  const source = getFlag(args, "--source");
  const reenable = getFlag(args, "--reenable");
  const allEnabled = hasFlag(args, "--all-enabled");
  const dryRun = hasFlag(args, "--dry-run");

  if (hasFlag(args, "--source") && source === null) {
    throw new Stage3ArgsError(`--source needs a source name.\n\n${USAGE}`);
  }
  if (hasFlag(args, "--reenable") && reenable === null) {
    throw new Stage3ArgsError(`--reenable needs a source name.\n\n${USAGE}`);
  }

  const modes = [source !== null, allEnabled, reenable !== null].filter(Boolean).length;
  if (modes === 0) {
    throw new Stage3ArgsError(
      `--stage3 needs one of --all-enabled, --source <name>, or --reenable <name>.\n\n${USAGE}`
    );
  }
  if (modes > 1) {
    throw new Stage3ArgsError(
      `--stage3 takes exactly one of --all-enabled, --source, --reenable.\n\n${USAGE}`
    );
  }

  return { source, allEnabled, reenable, dryRun };
}

/**
 * Pick the table rows a run should consider. Pure.
 *
 * `--all-enabled` selects rows whose toggle is on. `--source <name>` selects
 * exactly that row REGARDLESS of its toggle: naming a source on the command
 * line is itself the operator's activation gesture for that invocation. (The
 * per-company toggles inside the registry still apply either way.)
 *
 * @throws {Stage3ArgsError} when a named source is not in the table.
 */
export function selectEntries(args: Stage3Args, table: SourceTableEntry[]): SourceTableEntry[] {
  if (args.source !== null) {
    const entry = table.find((e) => e.name === args.source);
    if (!entry) {
      throw new Stage3ArgsError(
        `Unknown source "${args.source}". Known sources: ${sourceNames(table).join(", ")}`
      );
    }
    return [{ ...entry, enabled: true }];
  }
  return table.filter((e) => e.enabled);
}

// ============================================================
// Real implementations
// ============================================================

/**
 * Load the confirmed discovery scope ONCE, and return both consumers' views of
 * it: the prerank vocabulary and the Preferences object itself.
 *
 * Q2 ruling (Wave 6): with no preferences.json, Stage 3 REFUSES rather than
 * falling back to DEFAULT_VOCABULARY. Running against an unconfirmed scope
 * would be discovery against a field map the operator never approved — exactly
 * what D15 exists to prevent. This applies to `--dry-run` too: a preview
 * computed from the wrong vocabulary is a misleading preview.
 *
 * Q2 ruling (Wave 5): the same loaded object is handed to query_net sources
 * through SourceBuildContext. ONE loader, one read, no source touches disk.
 * This path remains strictly READ-ONLY — no session ever writes preferences.json.
 */
function loadScope(path: string): { vocabulary: ReturnType<typeof preferencesToVocabulary>; preferences: Preferences } {
  try {
    const preferences = loadPreferences(path);
    return { vocabulary: preferencesToVocabulary(preferences), preferences };
  } catch (err) {
    throw new Error(
      `Stage-3 discovery needs your confirmed discovery scope, and ${path} could not be loaded.\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n\n` +
        `Run \`oaos setup-scope\` and confirm your scope, then try again.\n` +
        `(Stage 3 will not fall back to a built-in vocabulary — that would search a scope you never approved.)`
    );
  }
}

/** normalize → runPipeline (real Gemini) → persist (real Airtable), per item. */
function makeProcessItem(): ProcessStage3Item {
  const inventory = loadInventory(resolve(process.cwd(), "evidence/inventory.md"));
  const gemini_client = createGeminiClient();
  const persistence = createPersistence();

  return async (item) => {
    const opportunity = normalize(item);
    const result = await runPipeline(item, {
      inventory,
      contacts_input: { opportunity, githubScan: [], manual: [] },
      gemini_client,
    });
    const writes = await persistence.writePipelineResult(result);
    const opp = writes[0];
    return {
      ok: Boolean(opp?.success),
      errors: writes.filter((w) => !w.success).map((w) => w.error ?? "unknown write error"),
    };
  };
}

// ============================================================
// Command
// ============================================================

/** Run the `oaos discover --stage3 ...` path. */
export async function runStage3Command(args: string[]): Promise<void> {
  const parsed = parseStage3Args(args);

  // --reenable is a pure state edit: no fetch, no scope, no credentials.
  if (parsed.reenable !== null) {
    const health = createHealthStore(HEALTH_PATH);
    const result = reenableSource(parsed.reenable, health);
    if (!result.found) {
      console.log(
        `\nNo health history for "${parsed.reenable}" in ${HEALTH_PATH} — nothing to re-enable.\n` +
          `Known sources: ${sourceNames().join(", ")}`
      );
      return;
    }
    console.log(
      `\nRe-enabled "${result.name}" (was ${result.previousStatus}). ` +
        `Its health history is cleared; it runs again on the next Stage-3 run.`
    );
    return;
  }

  const entries = selectEntries(parsed, STAGE3_SOURCES);
  if (entries.length === 0) {
    console.log(
      "\nNo Stage-3 source is enabled.\n" +
        "Every row in src/discovery/orchestrator/sources.ts ships `enabled: false` —\n" +
        "activating a source is a deliberate operator decision. Flip a row to run it\n" +
        "with --all-enabled, or run one now with:\n" +
        `  oaos discover --stage3 --source <name> --dry-run\n` +
        `Known sources: ${sourceNames().join(", ")}`
    );
    return;
  }

  const { vocabulary, preferences } = loadScope(resolve(process.cwd(), DEFAULT_PREFERENCES_PATH));

  // The Gemini tally describes THIS run, and it prints directly under this
  // run's source table. Zeroing it here makes that true by construction rather
  // than by "we only ever run once per process" — a tally that silently
  // accumulated across runs would eventually report numbers that don't match
  // what the operator just watched happen.
  resetGeminiCallStats();

  const summary: Stage3RunSummary = await runStage3({
    entries,
    sourceDeps: createSourceDeps(),
    vocabulary,
    // The operator's confirmed geo eligibility (v3). `loadScope` is already
    // v3-strict, so a file without a geo decision cannot reach here; null is
    // a confirmed `geo off` and disables the filter.
    geo: preferences.geo,
    health: createHealthStore(HEALTH_PATH),
    writeCalendar: (calendarEntries) => writeCalendarEntries(calendarEntries),
    // In a dry run the processor is never invoked; skip building real clients
    // so a preview needs no Gemini/Airtable credentials.
    processItem: parsed.dryRun ? async () => ({ ok: false, errors: [] }) : makeProcessItem(),
    buildContext: {
      githubToken: process.env.GITHUB_TOKEN,
      preferences,
      adzunaAppId: process.env.ADZUNA_APP_ID,
      adzunaAppKey: process.env.ADZUNA_APP_KEY,
    },
    dryRun: parsed.dryRun,
  });

  console.log(formatStage3Summary(summary));

  // Real runs only: in a dry run no pipeline runs, so the tally is all zeros
  // and formatGeminiStats returns "" anyway — the guard just makes that intent
  // explicit at the call site.
  if (!parsed.dryRun) {
    const geminiStats = formatGeminiStats(getGeminiCallStats());
    if (geminiStats !== "") console.log(geminiStats);
  }
}
