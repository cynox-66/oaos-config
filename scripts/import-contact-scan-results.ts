// scripts/import-contact-scan-results.ts
// THROWAWAY driver (see docs/known-issues.md): import already-scanned,
// pre-formatted `*-airtable-*.json` contact files into the Contacts table.
//
// Reuses the exact persistence primitive runContacts uses (contacts.ts:79-93):
// createAirtableClient().createRecord(TABLE_NAMES.contacts, fields). NOT
// writeContact — these files are already column-shaped (F3), so no mapping.
//
// Does NOT re-scan GitHub and does NOT touch cli/commands/contacts.ts. The
// files are passed explicitly on argv so nothing is regenerated.
//
//   npx tsx scripts/import-contact-scan-results.ts <file.json> [<file.json> ...]

import { readFileSync } from "node:fs";
import * as dotenv from "dotenv";
import { createAirtableClient, TABLE_NAMES } from "../src/persistence";

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("Usage: tsx scripts/import-contact-scan-results.ts <file.json> ...");
  }

  const client = createAirtableClient();
  let total = 0;
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const file of files) {
    const records = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
    console.log(`\n${file}: ${records.length} records`);
    for (const fields of records) {
      total += 1;
      const result = await client.createRecord(TABLE_NAMES.contacts, fields);
      if (result.success) {
        created += 1;
      } else {
        failed += 1;
        const name = typeof fields.Name === "string" ? fields.Name : "(unnamed)";
        errors.push(`${name}: ${result.error ?? "unknown write error"}`);
      }
    }
  }

  console.log(`\n=== Import complete: ${created}/${total} created, ${failed} failed ===`);
  if (errors.length > 0) {
    console.log("Failures:");
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
