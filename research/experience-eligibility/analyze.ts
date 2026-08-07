// analyze.ts — Q4: yield at the operator's threshold, composed with geo and
// seniority. Replays the CAPTURED corpus (raw/sweep-*.json) through the SAME
// shipped modules the orchestrator uses: real normalize, real geo mapper, real
// prerank, real vocabulary from the operator's confirmed v3 scope.
//
// COST: ZERO live requests. ZERO Gemini. ZERO writes. preferences.json
// READ-ONLY via the real loader.
//
// Run: npx tsx research/experience-eligibility/analyze.ts

import { readFileSync, readdirSync } from "node:fs";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";
import { prerank } from "../../src/discovery/prerank";
import { preferencesToVocabulary } from "../../src/discovery/orchestrator";
import { geoOf, itemsPassingGeo, partitionByGeo } from "../../src/discovery/geo";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../src/discovery/scope";

const RAW = `${import.meta.dirname}/raw`;
const prefs = loadPreferences(DEFAULT_PREFERENCES_PATH);
const vocabulary = preferencesToVocabulary(prefs);
const geo = prefs.geo;
if (!geo) throw new Error("this analysis assumes an active geo scope");

// ── Rebuild the RawItems exactly as himalayas.ts does ──────────────────────
const byGuid = new Map<string, Record<string, unknown>>();
for (const f of readdirSync(RAW).filter((f) => f.startsWith("sweep-")).sort()) {
  const d = JSON.parse(readFileSync(`${RAW}/${f}`, "utf8")) as { jobs?: Record<string, unknown>[] };
  for (const j of d.jobs ?? []) if (!byGuid.has(String(j.guid))) byGuid.set(String(j.guid), j);
}
const items: RawItem[] = [...byGuid.values()].map((raw) => ({
  source_type: "job_board",
  source_name: "himalayas",
  raw_payload: raw,
  url: (raw.applicationLink as string) ?? (raw.guid as string) ?? null,
  fetched_at: "2026-08-07T00:00:00.000Z",
}));

// ── The stated-minimum reader (PROBE-LOCAL, not shipped) ───────────────────
const PATS = [
  /(\d{1,2})\s*\+\s*(?:years|yrs)/g,
  /(?:at least|minimum(?: of)?|min\.?|over)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/g,
  /(\d{1,2})\s*(?:-|–|to)\s*\d{1,2}\s*(?:years|yrs)/g,
  /(\d{1,2})\s*(?:years|yrs)(?:\s+or\s+more)?\s+(?:of\s+)?(?:hands-on\s+|professional\s+|relevant\s+|industry\s+|work\s+)?experience/g,
];
function statedMinimum(raw: Record<string, unknown>): number | null {
  const t = String(raw.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  let min: number | null = null;
  for (const p of PATS) {
    for (const m of t.matchAll(p)) {
      const v = Number(m[1]);
      if (v <= 25 && (min === null || v < min)) min = v;
    }
  }
  return min;
}
/** Operator's ruled threshold: gate a stated minimum ABOVE 1 year; pass unstated. */
const gatesOnExperience = (raw: Record<string, unknown>): boolean => {
  const m = statedMinimum(raw);
  return m !== null && m > 1;
};

const payload = (i: RawItem) => i.raw_payload as Record<string, unknown>;
const label = (i: RawItem) =>
  `${String(payload(i).title ?? "?").slice(0, 56)} @ ${String(payload(i).companyName ?? "?").slice(0, 22)}`;

function main(): void {
  console.log(`corpus: ${items.length} unique guids from 13 captured queries\n`);

  // ── A. Experience gate over the WHOLE fetched corpus ─────────────────────
  const gatedAll = items.filter((i) => gatesOnExperience(payload(i)));
  console.log(`[A] fetched ${items.length} → experience-gated ${gatedAll.length} ` +
    `(${((100 * gatedAll.length) / items.length).toFixed(1)}%), surviving ${items.length - gatedAll.length}`);

  // ── B. Geo partition (real module) ───────────────────────────────────────
  const partition = partitionByGeo(items, () => "himalayas", geo);
  const eligible = itemsPassingGeo(partition, geo);
  console.log(`[B] geo: ${items.length} in → eligible ${partition.eligible.length}, ` +
    `ineligible ${partition.ineligible.length}, unresolved ${partition.unresolved.length} ` +
    `→ ${eligible.length} into prerank`);

  const geoThenExp = eligible.filter((i) => gatesOnExperience(payload(i)));
  console.log(`[C] of the ${eligible.length} geo-eligible → experience-gated ${geoThenExp.length}, ` +
    `surviving ${eligible.length - geoThenExp.length}`);
  for (const i of geoThenExp) {
    console.log(`      gate ${statedMinimum(payload(i))}y  ${payload(i).seniority}  ${label(i)}`);
  }

  // ── D. Real prerank (seniority lives here, as negativeTerms) ─────────────
  const result = prerank({ items: eligible, vocabulary }, { now: () => new Date() });
  console.log(`\n[D] prerank: ${eligible.length} in → ${result.passed.length} passed, ` +
    `${result.gated.length} gated ${JSON.stringify(result.stats.gatedByReason)}`);

  console.log(`\n[E] PASSED SET vs the experience threshold:`);
  let wouldGate = 0;
  for (const i of result.passed) {
    const m = statedMinimum(payload(i));
    const verdict = m !== null && m > 1 ? `GATE (${m}y)` : m !== null ? `pass (${m}y)` : `pass (unstated)`;
    if (m !== null && m > 1) wouldGate += 1;
    console.log(`      ${verdict.padEnd(16)} ${String(payload(i).seniority).padEnd(12)} ${label(i)}`);
  }
  console.log(`\n[F] COMPOSED: geo → seniority(prerank) → experience: ` +
    `${result.passed.length} passed, ${wouldGate} would gate on experience, ` +
    `${result.passed.length - wouldGate} REMAIN`);

  // ── G. What the facet would have made reachable ──────────────────────────
  const sen = (i: RawItem) => JSON.stringify(payload(i).seniority);
  const mix = new Map<string, number>();
  for (const i of eligible) mix.set(sen(i), (mix.get(sen(i)) ?? 0) + 1);
  console.log(`\n[G] seniority-label mix of the ${eligible.length} geo-eligible: ${JSON.stringify([...mix])}`);
}

main();
