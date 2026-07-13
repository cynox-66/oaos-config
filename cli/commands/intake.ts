// commands/intake.ts
// File: cli/commands/intake.ts
// Purpose: `oaos intake` — interactively collect a manual opportunity, run it
//          through the full intake pipeline (Engines 1→7), and persist it.
//
// This module owns the two operator-facing mapping tables (F1 source_type, F2
// category); the pure menu→value resolution is delegated to prompts.parseChoice.

import { resolve } from "node:path";
import { normalize } from "../../src/engines/normalization";
import type { SourceType, Category } from "../../src/engines/normalization/types";
import { runPipeline } from "../../src/pipeline";
import { createPersistence } from "../../src/persistence";
import { loadInventory } from "../../src/engines/evidence-matching/inventory";
import { createGeminiClient } from "../../src/engines/scoring/gemini";
import {
  buildManualRawItem,
  createPrompter,
  parseChoice,
  validateURL,
  type ManualEntry,
  type Prompter,
} from "../prompts";
import { formatIntakeSummary } from "../format";

// ============================================================
// F1 — source_type menu → SourceType mapping (config lives here)
// ============================================================

export const SOURCE_TYPE_OPTIONS: readonly { label: string; value: SourceType }[] = [
  { label: "GitHub / OSS", value: "oss" },
  { label: "Job board / LinkedIn", value: "job_board" },
  { label: "Freelance platform", value: "freelance" },
  { label: "Startup / network", value: "network" },
  { label: "Other / skip", value: "network" }, // default
];

/** Resolve a source-type menu choice; unrecognized input defaults to "network". */
export function parseSourceType(input: string): SourceType {
  return parseChoice(input, SOURCE_TYPE_OPTIONS) ?? "network";
}

// ============================================================
// F2 — category menu → Category mapping (config lives here)
// ============================================================

export const CATEGORY_OPTIONS: readonly { label: string; value: Category }[] = [
  { label: "Job", value: "Job" },
  { label: "Internship", value: "Internship" },
  { label: "Freelance", value: "Freelance" },
  { label: "Startup", value: "Startup" },
  { label: "OSS", value: "OSS" },
  { label: "Other", value: "Other" },
];

/** Resolve a category menu choice; unrecognized input defaults to "Other". */
export function parseCategory(input: string): Category {
  return parseChoice(input, CATEGORY_OPTIONS) ?? "Other";
}

// ============================================================
// Interactive helpers (impure)
// ============================================================

/** Render a numbered menu for a set of options. */
function menu(title: string, options: readonly { label: string }[]): string {
  const lines = [title];
  options.forEach((o, i) => lines.push(`  ${i + 1}. ${o.label}`));
  lines.push("  > ");
  return lines.join("\n");
}

/** Ask until a non-empty answer is given. */
async function askRequired(p: Prompter, question: string): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const answer = (await p.ask(question)).trim();
    if (answer !== "") return answer;
    process.stdout.write("  ! Required.\n");
  }
}

/** Ask an optional free-text field; blank → null. */
async function askOptional(p: Prompter, question: string): Promise<string | null> {
  const answer = (await p.ask(question)).trim();
  return answer === "" ? null : answer;
}

// ============================================================
// Command
// ============================================================

/** Collect a manual opportunity interactively and return the built ManualEntry. */
async function collectEntry(p: Prompter): Promise<ManualEntry> {
  const company = await askRequired(p, "Company: ");
  const role = await askRequired(p, "Role: ");
  const description = (await p.ask("Description (one line): ")).trim();
  const comp = await askOptional(p, "Compensation (optional): ");
  const location = await askOptional(p, "Location (optional): ");
  const remote = await askOptional(p, "Remote / hybrid / onsite (optional): ");
  const url = await p.askValidated("Source URL (optional): ", validateURL);

  const source_type = parseSourceType(
    await p.ask(menu("\nSource type:", SOURCE_TYPE_OPTIONS))
  );
  const category = parseCategory(
    await p.ask(menu("\nCategory:", CATEGORY_OPTIONS))
  );

  return { company, role, description, comp, location, remote, url, category, source_type };
}

/**
 * Run the `oaos intake` command. Prompts for a manual opportunity, runs the full
 * intake pipeline (real Gemini + Airtable), and prints a summary.
 */
export async function runIntake(): Promise<void> {
  const prompter = createPrompter();
  let entry: ManualEntry;
  try {
    entry = await collectEntry(prompter);
  } finally {
    prompter.close();
  }

  const raw = buildManualRawItem(entry, new Date().toISOString());

  const inventory = loadInventory(resolve(process.cwd(), "evidence/inventory.md"));
  const gemini_client = createGeminiClient();

  // The pipeline overrides contacts_input.opportunity with its own normalized
  // record; we supply the normalized opportunity to satisfy the type. Manual
  // intake discovers no NEW contacts, but already-persisted Contacts for this
  // company (from earlier `oaos contacts` scans) are resolved and fed in as the
  // manual source so contact scoring reflects them. No live scan happens here.
  const opportunity = normalize(raw);
  const persistence = createPersistence();
  const manual = await persistence.findContactsByCompany(entry.company);

  const result = await runPipeline(raw, {
    inventory,
    contacts_input: { opportunity, githubScan: [], manual },
    gemini_client,
  });

  const writes = await persistence.writePipelineResult(result);
  const oppWrite = writes[0];

  console.log(
    formatIntakeSummary({
      company: result.opportunity.company,
      role: result.opportunity.role,
      category: result.opportunity.category,
      tier: result.score.tier,
      total: result.score.total,
      action: result.recommendation.action,
      contactCount: result.contacts.ordered.length,
      recordId: oppWrite?.success ? oppWrite.record_id ?? null : null,
      errors: writes.filter((w) => !w.success).map((w) => w.error ?? "unknown write error"),
    })
  );
}
