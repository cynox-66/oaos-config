// commands/score.ts
// File: cli/commands/score.ts
// Purpose: `oaos score --company "X"` — re-score an existing opportunity.
//          Finds the first Opportunity whose Company matches, recovers its
//          description from Notes, re-runs evidence matching + scoring (with
//          research=null, contacts=[]), and PATCHes only the two writable inputs
//          (Quality Score, Match Score). Total Score / Tier are Airtable formula
//          fields and recompute automatically (F4).

import { resolve } from "node:path";
import { createAirtableClient, parseOpportunity } from "../../src/persistence";
import { FIELD_NAMES, TABLE_NAMES } from "../../src/persistence";
import { match } from "../../src/engines/evidence-matching";
import { computeScore } from "../../src/engines/scoring";
import { createGeminiClient } from "../../src/engines/scoring/gemini";
import { loadInventory } from "../../src/engines/evidence-matching/inventory";
import { formatScoreChange } from "../format";
import { getFlag } from "../args";

const FO = FIELD_NAMES.opportunities;

/** Quote a value for an Airtable formula string literal. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

/** Recover the normalized description from an Opportunity Notes field. */
function recoverDescription(notes: string): string {
  const m = notes.match(/^Description:\s*(.+)$/m);
  return m ? m[1].trim() : "";
}

const asNumber = (v: unknown): number | null => (typeof v === "number" ? v : null);
const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Run the `oaos score --company "X"` command.
 * @param args the argv tail after the subcommand.
 */
export async function runScore(args: string[]): Promise<void> {
  const company = getFlag(args, "--company");
  if (!company) {
    throw new Error('Usage: oaos score --company "Company Name"');
  }

  const client = createAirtableClient();
  const { records } = await client.listRecords(TABLE_NAMES.opportunities, {
    filterByFormula: `{${FO.company}} = ${quote(company)}`,
  });
  if (records.length === 0) {
    console.log(`No opportunity found for company "${company}".`);
    return;
  }

  const record = records[0];
  const opportunity = parseOpportunity(record);
  // parseOpportunity is lossy for the description; recover it from Notes so the
  // evidence/scoring passes see real content.
  const description = recoverDescription(asString(record.fields[FO.notes]) ?? "");
  opportunity.description_raw = description;
  opportunity.description_norm = description;

  const now = new Date();
  const gemini = createGeminiClient();
  const inventory = loadInventory(resolve(process.cwd(), "evidence/inventory.md"));

  const evidence_match = await match({ opportunity, inventory }, { client: gemini, now });
  const score = await computeScore(
    { opportunity, research: null, contacts: [], evidence_match },
    { client: gemini, now: now.toISOString() }
  );

  // PATCH only the writable inputs; Total Score + Tier are formula fields.
  const patch = await client.updateRecord(TABLE_NAMES.opportunities, record.id, {
    [FO.quality_score]: score.quality.total,
    [FO.match_score]: score.match.total,
  });
  if (!patch.success) {
    throw new Error(`Airtable PATCH failed: ${patch.error ?? "unknown error"}`);
  }

  console.log(
    formatScoreChange({
      company,
      usingFirstMatch: records.length > 1,
      oldQuality: asNumber(record.fields[FO.quality_score]),
      newQuality: score.quality.total,
      oldMatch: asNumber(record.fields[FO.match_score]),
      newMatch: score.match.total,
      oldTotal: asNumber(record.fields[FO.total_score]),
      newTotal: score.total,
      oldTier: asString(record.fields[FO.tier]),
      newTier: score.tier,
    })
  );
}
