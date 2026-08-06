// setup-scope.ts
// File: cli/commands/setup-scope.ts
// Purpose: `oaos setup-scope` — generate a PROPOSED discovery field map from the
//          operator's real profile artifacts, let the operator confirm / untick /
//          add interactively, and persist the confirmed scope to preferences.json
//          (D15: the generator proposes, the operator disposes).
//
//          `oaos setup-scope --show` prints the current scope and writes nothing.
//
// Zero Gemini, zero network, zero Airtable. All decision logic lives in the pure
// reducer (src/discovery/scope/reducer.ts); this file is the I/O shell.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadInventory } from "../../src/engines/evidence-matching";
import { loadBaseResume, loadOperatorProfile } from "../resume";
import {
  buildPreferences,
  computeBacking,
  deriveScope,
  DEFAULT_PREFERENCES_PATH,
  initialState,
  loadBaseline,
  loadPreferences,
  parseScopeCommand,
  reduceScope,
  writePreferences,
} from "../../src/discovery/scope";
import type {
  Evidence,
  Preferences,
  ScopeBaseline,
  ScopeProposal,
  ScopeState,
} from "../../src/discovery/scope/types";
import { createPrompter } from "../prompts";
import { hasFlag } from "../args";

// ============================================================
// Pure rendering
// ============================================================

function tick(enabled: boolean): string {
  return enabled ? "[x]" : "[ ]";
}

/**
 * Render the editable field map, grouped exactly as D15 asks: evidence-backed /
 * profile-matched-but-unproven / available. Numbers are the field's stable index
 * across the whole list, so they do not shift as groups change. Pure.
 */
export function renderState(state: ScopeState, newlyBacked: string[] = []): string {
  const rows = state.fields.map((field, i) => ({ field, n: i + 1 }));
  const backed = rows.filter((r) => r.field.evidence_backed);
  const claimed = rows.filter((r) => !r.field.evidence_backed && r.field.enabled);
  const available = rows.filter((r) => !r.field.evidence_backed && !r.field.enabled);

  const out: string[] = [];
  const section = (title: string, group: typeof rows, empty: string): void => {
    out.push(`\n${title}`);
    if (group.length === 0) {
      out.push(`  (${empty})`);
      return;
    }
    for (const { field, n } of group) {
      const flags: string[] = [];
      if (field.aspirational) flags.push("aspirational");
      if (newlyBacked.includes(field.name)) flags.push("NEW EVIDENCE");
      const suffix = flags.length > 0 ? `  <${flags.join(", ")}>` : "";
      out.push(`  ${String(n).padStart(2)}. ${tick(field.enabled)} ${field.name}${suffix}`);
      if (field.supporting_evidence_ids.length > 0) {
        out.push(`        evidence: ${field.supporting_evidence_ids.join(", ")}`);
      }
    }
  };

  section("Evidence-backed", backed, "none");
  section("Profile-matched, no evidence yet", claimed, "none");
  section("Available, unticked", available, "none");

  out.push("\nWork types:");
  out.push(`  ${tick(state.work_types.job)} job    ${tick(state.work_types.internship)} internship    ${tick(state.work_types.oss)} oss    [ ] freelance (locked off in v1)`);
  out.push("  Remote-only: locked on in v1");
  out.push(renderSeniority(state));
  return `${out.join("\n")}\n`;
}

/**
 * Render the seniority section. Pure.
 *
 * The warning line is not decoration. The operator is confirming an
 * unconditional gate that matches an item's WHOLE text — body included — so a
 * posting that merely mentions a level is excluded too. That has to be said at
 * the moment of confirmation, not buried in a doc.
 */
export function renderSeniority(state: ScopeState): string {
  const out: string[] = [];
  out.push("\nSeniority — exclude these levels (nothing excluded by default):");

  state.seniority.levels.forEach((level, i) => {
    const flag = level.available.length > 0 ? "  <NEW TERMS>" : "";
    out.push(`  s${i + 1}. ${tick(level.excluded)} ${level.level}${flag}`);
    out.push(`        terms: ${level.terms.join(", ")}`);
    if (level.available.length > 0) {
      out.push(`        available: ${level.available.join(", ")}   ('adopt s${i + 1}' to include)`);
    }
  });

  out.push(
    "  Note: these match anywhere in a posting's TEXT, including the body — a posting"
  );
  out.push("        that merely MENTIONS \"senior engineers\" is excluded too.");

  out.push("\nEntry-level query modifier:");
  out.push(
    `  entry  ${tick(state.seniority.entry_level_query_modifier)} append "entry level" to ` +
      `himalayas / freehire / adzuna query strings`
  );
  return out.join("\n");
}

/** Human-readable dump of a saved scope, for `--show`. Pure. */
export function renderPreferences(preferences: Preferences): string {
  const out: string[] = [];
  out.push(`Discovery scope (preferences.json, v${preferences.version})`);
  out.push(`  generated: ${preferences.generated_at}`);
  out.push(`  confirmed: ${preferences.confirmed_at}`);

  const enabled = preferences.fields.filter((f) => f.enabled);
  const disabled = preferences.fields.filter((f) => !f.enabled);

  out.push(`\nSearching for (${enabled.length}):`);
  if (enabled.length === 0) out.push("  (nothing — discovery would return nothing)");
  for (const field of enabled) {
    const tags: string[] = [field.origin === "operator_added" ? "operator-added" : "derived"];
    if (field.aspirational) tags.push("aspirational");
    else if (field.evidence_backed) tags.push(`${field.supporting_evidence_ids.length} evidence`);
    out.push(`  [x] ${field.name}  (${tags.join(", ")})`);
    if (field.supporting_evidence_ids.length > 0) {
      out.push(`        ${field.supporting_evidence_ids.join(", ")}`);
    }
  }

  out.push(`\nNot searching (${disabled.length}):`);
  out.push(disabled.length === 0 ? "  (none)" : `  ${disabled.map((f) => f.name).join(", ")}`);

  const types = (["job", "internship", "oss"] as const).filter((k) => preferences.work_types[k]);
  out.push(`\nWork types: ${types.length > 0 ? types.join(", ") : "(none)"}  |  freelance: off (locked)`);
  out.push(`Remote-only: ${preferences.remote_only} (locked)`);

  const excluded = preferences.seniority.levels.filter((l) => l.excluded);
  out.push(`\nSeniority exclusions (${excluded.length}):`);
  if (excluded.length === 0) out.push("  (none — no posting is gated on seniority)");
  for (const level of excluded) {
    out.push(`  [x] ${level.level}  →  ${level.terms.join(", ")}`);
  }
  out.push(
    `Entry-level query modifier: ${preferences.seniority.entry_level_query_modifier ? "on" : "off"}`
  );
  return `${out.join("\n")}\n`;
}

const HELP_TEXT = `
Commands:
  <number>        tick / untick that field
  add <term>      add a custom field (evidence backing is computed for it)
  job | internship | oss    toggle that work type
  s<number>       exclude / stop excluding that seniority level
  adopt s<number> take that level's newly available terms
  entry           toggle the entry-level query modifier
  done            confirm and save to preferences.json
  quit            abort — nothing is written
  help            show this
`;

// ============================================================
// I/O shell
// ============================================================

interface Artifacts {
  proposal: ScopeProposal;
  inventory: Evidence[];
  existing: ScopeBaseline | null;
}

/** Load every input artifact through its existing strict loader. Throws on any
 *  malformed file, with the offending file + path named. No partial setup.
 *
 *  The existing scope is read with `loadBaseline`, NOT `loadPreferences`: this
 *  is the one place a pre-seniority (v1) file must still open, because this is
 *  the command whose job is to replace it. Everything else about the file is
 *  validated with the same strict code, and a baseline can never be persisted
 *  without passing through the reducer and a confirmed `buildPreferences`. */
function loadArtifacts(root: string, preferencesPath: string, now: string): Artifacts {
  const resume = loadBaseResume(resolve(root, "resume/base_resume.json"));
  const profile = loadOperatorProfile(resolve(root, "resume/operator_profile.json"));
  const inventory = loadInventory(resolve(root, "evidence/inventory.md"));
  const existing = existsSync(preferencesPath) ? loadBaseline(preferencesPath) : null;
  const proposal = deriveScope(
    { resume, profile, inventory, ...(existing ? { existing } : {}) },
    { now }
  );
  return { proposal, inventory, existing };
}

async function runInteractive(args: string[]): Promise<void> {
  const root = process.cwd();
  const preferencesPath = resolve(root, DEFAULT_PREFERENCES_PATH);
  const now = new Date().toISOString();

  const { proposal, inventory, existing } = loadArtifacts(root, preferencesPath, now);
  const out = process.stdout;

  out.write(
    existing
      ? `Loaded existing scope from ${DEFAULT_PREFERENCES_PATH} — showing it as the baseline.\n`
      : `No ${DEFAULT_PREFERENCES_PATH} yet — deriving a fresh proposal from your resume, profile, and evidence inventory.\n`
  );
  if (existing && existing.seniority === null) {
    out.write(
      `\nThat file is schema v${existing.version}, which predates the seniority dimension.\n` +
        `Your field ticks and work types are carried forward below. The new Seniority\n` +
        `section is proposed with nothing excluded, so confirming without touching it\n` +
        `reproduces your current discovery behaviour exactly.\n`
    );
  }
  if (proposal.newly_backed.length > 0) {
    out.write(`New evidence now backs: ${proposal.newly_backed.join(", ")}\n`);
  }
  out.write("\nNothing is saved until you type 'done'.\n");
  out.write(HELP_TEXT);

  let state = initialState(proposal);
  const prompter = createPrompter();
  try {
    while (state.status === "editing") {
      out.write(renderState(state, proposal.newly_backed));
      if (state.notice) out.write(`\n  → ${state.notice}\n`);
      const line = await prompter.ask("\nscope> ");
      const command = parseScopeCommand(line, state);

      if (command === null) {
        state = { ...state, notice: `Unrecognized input: "${line.trim()}" — type 'help'` };
        continue;
      }
      if (command.kind === "help") {
        out.write(HELP_TEXT);
        state = { ...state, notice: null };
        continue;
      }
      if (command.kind === "add") {
        const backing = computeBacking(command.term, inventory);
        state = reduceScope(state, { kind: "add_field", name: command.term, ...backing });
        continue;
      }
      state = reduceScope(state, command);
    }
  } finally {
    prompter.close();
  }

  if (state.status === "aborted") {
    out.write("\nAborted — nothing written.\n");
    return;
  }

  const preferences = buildPreferences(state, {
    generated_at: proposal.generated_at,
    confirmed_at: new Date().toISOString(),
  });
  writePreferences(preferencesPath, preferences);

  const enabled = preferences.fields.filter((f) => f.enabled);
  out.write(`\nSaved ${DEFAULT_PREFERENCES_PATH}\n`);
  out.write(`  ${enabled.length} field(s) enabled: ${enabled.map((f) => f.name).join(", ")}\n`);
  const types = (["job", "internship", "oss"] as const).filter((k) => preferences.work_types[k]);
  out.write(`  work types: ${types.join(", ") || "(none)"}\n`);
  const excluded = preferences.seniority.levels.filter((l) => l.excluded).map((l) => l.level);
  out.write(`  seniority excluded: ${excluded.join(", ") || "(none)"}\n`);
  out.write(
    `  entry-level query modifier: ${preferences.seniority.entry_level_query_modifier ? "on" : "off"}\n`
  );
  void args;
}

function runShow(): void {
  const preferencesPath = resolve(process.cwd(), DEFAULT_PREFERENCES_PATH);
  if (!existsSync(preferencesPath)) {
    process.stderr.write(
      `No ${DEFAULT_PREFERENCES_PATH} found. Run 'oaos setup-scope' to create one.\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(renderPreferences(loadPreferences(preferencesPath)));
}

/** Entry point for `oaos setup-scope [--show]`. */
export async function runSetupScope(args: string[]): Promise<void> {
  if (hasFlag(args, "--show")) {
    runShow();
    return;
  }
  await runInteractive(args);
}
