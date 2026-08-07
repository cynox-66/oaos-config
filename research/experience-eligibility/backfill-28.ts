// backfill-28.ts — known-issues #28 migration.
//
// ⛔ COMPLETED ONE-TIME MIGRATION — DO NOT RE-RUN. ⛔
//
// This ran once, on 2026-08-07, against the 7 Himalayas records written by the
// 2026-08-06 run. Those records are already backfilled and verified. It is
// kept for its PATTERN, not its reproducibility.
//
// Re-running it would be wrong twice over:
//   1. Its safety gate reproduces the PRE-FIX fingerprint and requires it to
//      match what is STORED. The stored values are now the POST-fix ones, so
//      the gate would (correctly) refuse and exit 1.
//   2. It reads `raw/`, which is gitignored. From a clean clone there is no
//      corpus, and a regenerated capture has DRIFTED — postings expire, so the
//      payloads behind those 7 records may no longer be fetchable at all.
//
// THE PART WORTH KEEPING is the safety gate itself (`buildPlan`, and the
// `verified` flag that gates `patch`): before trusting a new dedupe key,
// re-derive the OLD one through the SAME real code path with the new key
// removed, and require byte-identical reproduction of what is stored. That
// proves the reconstruction matches what the original run actually did rather
// than what a later session assumes it did. Copy that shape for any future
// migration that changes a fingerprint; do not copy this file's record list.
//
// The `companyName` fix changes what `normalize()` produces for every
// Himalayas item, and the fingerprint is sha1(company|role|url-host). The 7
// records already in Airtable were written with company="" and therefore carry
// STALE fingerprints. Left alone, the next run would not match them and would
// create 7 duplicates instead of updating in place.
//
// So this backfills BOTH `Company` and `Fingerprint`.
//
// SAFETY: before trusting any new fingerprint, it reproduces the OLD one by
// re-running the SAME real normalize() on the same payload with `companyName`
// removed. If the reproduction does not match the stored fingerprint
// byte-for-byte, the reconstruction is wrong and the script REFUSES to write.
//
// Dry run (default):  npx tsx research/experience-eligibility/backfill-28.ts
// Apply:              npx tsx research/experience-eligibility/backfill-28.ts --apply

import { readFileSync, readdirSync } from "node:fs";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";

const RAW = `${import.meta.dirname}/raw`;
const APPLY = process.argv.includes("--apply");

// The 7 himalayas records, read from Airtable 2026-08-07.
const RECORDS = [
  ["recok6rs6BksDShBP", "fe365b31bda66196f323db41fad194821795c368", "https://himalayas.app/companies/vexxhost-inc/jobs/kubernetes-engineer-english"],
  ["recQTlbmBkWl91eXK", "a050b2c1a17b6e3b86de9735feda77ca1bc18186", "https://himalayas.app/companies/conversenow-ai/jobs/back-end-developer-job-id-2266"],
  ["recQ9bAB50p5svota", "cde213e7e9b9834cfc6e0b230598856f4d49e5c6", "https://himalayas.app/companies/uniplaces/jobs/ambassadors-worldwide-5273727181"],
  ["rec2mHDepkLbXWprm", "71f342e8d4edc3d1d93887469b03658066fac1c9", "https://himalayas.app/companies/complexchaos/jobs/evangelist"],
  ["recJic71MBJfSY4oS", "eff32a73ebfb5fde202bbf3234faf1b8c73e06fd", "https://himalayas.app/companies/thehivecareers/jobs/chief-data-officer-cdo-5522209466"],
  ["recKGz1nTkyDoO29F", "dccd53bcf790920720fb7f9c6cb172be585d2668", "https://himalayas.app/companies/talent-sam/jobs/front-end-developer-9533228429"],
  ["recIrdMaO27ayNQtG", "2a7f564beeacb73b5aa82ad3588f963eec675422", "https://himalayas.app/companies/valerie-group/jobs/frontend-web-developer"],
] as const;

// ── Index the captured corpus by both identity keys himalayas.ts can use ────
const byUrl = new Map<string, Record<string, unknown>>();
for (const f of readdirSync(RAW).filter((f) => f.startsWith("sweep-"))) {
  const d = JSON.parse(readFileSync(`${RAW}/${f}`, "utf8")) as { jobs?: Record<string, unknown>[] };
  for (const j of d.jobs ?? []) {
    if (typeof j.guid === "string") byUrl.set(j.guid, j);
    if (typeof j.applicationLink === "string") byUrl.set(j.applicationLink, j);
  }
}

/** Rebuild the RawItem exactly as himalayas.ts does. */
const toRawItem = (raw: Record<string, unknown>, url: string): RawItem => ({
  source_type: "job_board",
  source_name: "himalayas",
  raw_payload: raw,
  url,
  fetched_at: "2026-08-06T18:30:00.000Z",
});

interface Plan {
  id: string;
  company: string;
  role: string;
  oldFp: string;
  newFp: string;
  reproducedOldFp: string;
  verified: boolean;
}

function buildPlan(): Plan[] {
  const plan: Plan[] = [];
  for (const [id, storedFp, url] of RECORDS) {
    const raw = byUrl.get(url);
    if (!raw) throw new Error(`${id}: no captured payload for ${url}`);

    const fixed = normalize(toRawItem(raw, url));

    // Reproduce the pre-fix result: same payload, `companyName` removed.
    const { companyName: _drop, ...preFixPayload } = raw;
    const preFix = normalize(toRawItem(preFixPayload, url));

    plan.push({
      id,
      company: fixed.company,
      role: fixed.role,
      oldFp: storedFp,
      newFp: fixed.fingerprint,
      reproducedOldFp: preFix.fingerprint,
      verified: preFix.fingerprint === storedFp && preFix.company === "",
    });
  }
  return plan;
}

async function patch(plan: Plan[]): Promise<void> {
  const key = process.env.AIRTABLE_API_KEY ?? process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) throw new Error("AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set");

  const res = await fetch(`https://api.airtable.com/v0/${base}/Opportunities`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      records: plan.map((p) => ({
        id: p.id,
        fields: { Company: p.company, Fingerprint: p.newFp },
      })),
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${body}`);
  console.log(`\n✅ PATCHed ${plan.length} records (HTTP ${res.status})`);
}

async function main(): Promise<void> {
  const plan = buildPlan();

  console.log("id                 verified  company                  old fp → new fp");
  for (const p of plan) {
    console.log(
      `${p.id}  ${p.verified ? "  OK    " : " ✗ FAIL "}  ${p.company.slice(0, 22).padEnd(24)}` +
        `${p.oldFp.slice(0, 8)} → ${p.newFp.slice(0, 8)}   ${p.role.slice(0, 34)}`
    );
    if (!p.verified) {
      console.log(`     stored     ${p.oldFp}`);
      console.log(`     reproduced ${p.reproducedOldFp}`);
    }
  }

  const failed = plan.filter((p) => !p.verified);
  if (failed.length > 0) {
    console.error(
      `\n❌ REFUSING TO WRITE — ${failed.length} record(s) did not reproduce their stored ` +
        `fingerprint from the captured payload. The reconstruction is wrong; a write ` +
        `would corrupt the dedupe key.`
    );
    process.exit(1);
  }

  const changed = plan.filter((p) => p.oldFp !== p.newFp).length;
  console.log(
    `\nAll ${plan.length} reproduced their stored fingerprint exactly → reconstruction verified.` +
      `\n${changed} of ${plan.length} fingerprints change and MUST be written, or the next ` +
      `run creates duplicates.`
  );

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to patch.");
    return;
  }
  await patch(plan);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
