// commands/contacts.ts
// File: cli/commands/contacts.ts
// Purpose: `oaos contacts --repo owner/repo [--min-contributions N]` — spawn the
//          existing github-contributor-scan script, then import its newest
//          Airtable-formatted output directly into the Contacts table.
//
//          Records are POSTed via the raw client's createRecord (NOT writeContact,
//          which requires an opportunity and rewrites Notes). The scan's
//          toAirtableFormat output already matches the Contacts columns (F3).

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createAirtableClient, TABLE_NAMES } from "../../src/persistence";
import { formatContactsImport } from "../format";
import { getFlag } from "../args";
import { validateMinContributions } from "../prompts";

const OUTPUT_DIR = resolve(process.cwd(), "scripts/output");
const SCAN_SCRIPT = "scripts/github-contributor-scan.ts";

/** Run the contributor scan as a child process, inheriting stdio + env. */
function runScan(repo: string, minContributions: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "npx",
      ["tsx", SCAN_SCRIPT, "--repo", repo, "--min-contributions", minContributions],
      { stdio: "inherit", env: process.env }
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`github-contributor-scan exited with code ${code}`));
    });
  });
}

/** Newest `*-airtable-*.json` file in scripts/output, or null if none. */
function newestAirtableFile(): string | null {
  let files: string[];
  try {
    files = readdirSync(OUTPUT_DIR);
  } catch {
    return null;
  }
  const candidates = files
    .filter((f) => f.includes("-airtable-") && f.endsWith(".json"))
    .map((f) => {
      const full = resolve(OUTPUT_DIR, f);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);
  return candidates.length > 0 ? candidates[candidates.length - 1].full : null;
}

/**
 * Run the `oaos contacts` command.
 * @param args the argv tail after the subcommand.
 */
export async function runContacts(args: string[]): Promise<void> {
  const repo = getFlag(args, "--repo");
  if (!repo || !repo.includes("/")) {
    throw new Error("Usage: oaos contacts --repo owner/repo [--min-contributions N]");
  }

  const minRaw = getFlag(args, "--min-contributions") ?? "3";
  const min = validateMinContributions(minRaw);
  if (min.error !== null) {
    throw new Error(`--min-contributions: ${min.error}`);
  }

  await runScan(repo, String(min.value));

  const file = newestAirtableFile();
  if (!file) {
    throw new Error(`No *-airtable-*.json found in ${OUTPUT_DIR} after scan.`);
  }

  const records = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  const client = createAirtableClient();

  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const fields of records) {
    const result = await client.createRecord(TABLE_NAMES.contacts, fields);
    if (result.success) {
      created += 1;
    } else {
      failed += 1;
      errors.push(result.error ?? "unknown write error");
    }
  }

  console.log(
    formatContactsImport({ file, total: records.length, created, failed, errors })
  );
}
