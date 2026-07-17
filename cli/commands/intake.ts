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
import { loadBaseResume, loadOperatorProfile } from "../resume";
import type { Channel, AskType } from "../../src/engines/outreach-package/types";
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
// C7 — category → default (channel, ask_type) for the outreach draft
// ============================================================

/** The outreach discriminators (Engine 7 inputs) chosen per intake. */
export interface OutreachChoice {
  channel: Channel;
  ask_type: AskType;
}

/**
 * Category-derived default channel + ask_type for the outreach draft. The
 * operator can accept or override these at the prompt. "Other" (and any
 * unmapped category) falls back to the Job default.
 */
export function defaultOutreachForCategory(category: Category): OutreachChoice {
  switch (category) {
    case "Internship":
      return { channel: "email", ask_type: "internship_inquiry" };
    case "Freelance":
      return { channel: "email", ask_type: "freelance_pitch" };
    case "OSS":
      return { channel: "github", ask_type: "oss_contribution" };
    case "Startup":
      return { channel: "email", ask_type: "collaboration" };
    case "Job":
    case "Other":
    default:
      return { channel: "email", ask_type: "referral_request" };
  }
}

/** Valid channel values (for prompt override validation). */
export const CHANNEL_VALUES: readonly Channel[] = [
  "email",
  "linkedin_connect",
  "linkedin_dm",
  "github",
  "slack",
];

/** Valid ask_type values (for prompt override validation). */
export const ASK_TYPE_VALUES: readonly AskType[] = [
  "internship_inquiry",
  "oss_contribution",
  "advice",
  "collaboration",
  "freelance_pitch",
  "referral_request",
];

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
 * Prompt for the outreach channel + ask_type, offering the category-derived
 * default (blank answer accepts it; an unrecognized override falls back to the
 * default too). Impure; the pure default logic is {@link defaultOutreachForCategory}.
 */
async function collectOutreachChoice(
  p: Prompter,
  category: Category
): Promise<OutreachChoice> {
  const def = defaultOutreachForCategory(category);
  const channelAns = (
    await p.ask(
      `\nOutreach channel [${def.channel}] (${CHANNEL_VALUES.join(", ")}): `
    )
  ).trim();
  const askAns = (
    await p.ask(
      `Ask type [${def.ask_type}] (${ASK_TYPE_VALUES.join(", ")}): `
    )
  ).trim();
  const channel = CHANNEL_VALUES.includes(channelAns as Channel)
    ? (channelAns as Channel)
    : def.channel;
  const ask_type = ASK_TYPE_VALUES.includes(askAns as AskType)
    ? (askAns as AskType)
    : def.ask_type;
  return { channel, ask_type };
}

/**
 * Run the `oaos intake` command. Prompts for a manual opportunity, runs the full
 * intake pipeline (real Gemini + Airtable), and prints a summary.
 */
export async function runIntake(): Promise<void> {
  // Load the read-only structured inputs for Engine 6 up front. A malformed
  // file throws ResumeValidationError (exact path) and stops intake — we never
  // coerce a bad resume into the pipeline.
  const base_resume = loadBaseResume(resolve(process.cwd(), "resume/base_resume.json"));
  const operator_profile = loadOperatorProfile(
    resolve(process.cwd(), "resume/operator_profile.json")
  );

  const prompter = createPrompter();
  let entry: ManualEntry;
  let outreach: OutreachChoice;
  try {
    entry = await collectEntry(prompter);
    outreach = await collectOutreachChoice(prompter, parseCategory(entry.category));
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
    base_resume,
    operator_profile,
    channel: outreach.channel,
    ask_type: outreach.ask_type,
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
