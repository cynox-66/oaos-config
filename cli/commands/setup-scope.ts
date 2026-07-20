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
  loadPreferences,
  parseScopeCommand,
  reduceScope,
  writePreferences,
} from "../../src/discovery/scope";
import type {
  Evidence,
  Preferences,
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
  return `${out.join("\n")}\n`;
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
  return `${out.join("\n")}\n`;
}

const HELP_TEXT = `
Commands:
  <number>        tick / untick that field
  add <term>      add a custom field (evidence backing is computed for it)
  job | internship | oss    toggle that work type
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
  existing: Preferences | null;
}

/** Load every input artifact through its existing strict loader. Throws on any
 *  malformed file, with the offending file + path named. No partial setup. */
function loadArtifacts(root: string, preferencesPath: string, now: string): Artifacts {
  const resume = loadBaseResume(resolve(root, "resume/base_resume.json"));
  const profile = loadOperatorProfile(resolve(root, "resume/operator_profile.json"));
  const inventory = loadInventory(resolve(root, "evidence/inventory.md"));
  const existing = existsSync(preferencesPath) ? loadPreferences(preferencesPath) : null;
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
