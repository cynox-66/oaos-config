// verify-g1-replay.ts — G1 Step-2 verification, replay arm (RESEARCH ARTIFACT).
// Drives the REAL runStage3 (the shipped path) over the 2026-08-06 captured
// Greenhouse bytes: control (geo off) vs geo-filtered. Zero network, zero
// Gemini, zero writes; preferences.json is read via loadBaseline only
// (read-only; the geo section is constructed IN MEMORY — the sanctioned
// probe pattern, precedent oneTermScope / verify-seniority).
// Run: npx tsx research/phase1-eligibility/verify-g1-replay.ts

import { readFileSync } from "fs";
import { join } from "path";
import { greenhouseAdapter } from "../../src/discovery/stage3/adapters/greenhouse";
import { createCompanyBoardSource } from "../../src/discovery/stage3/company-board";
import { COMPANY_REGISTRY } from "../../src/discovery/stage3/registry";
import type { SourceDeps } from "../../src/discovery/stage3/types";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";
import { prerank } from "../../src/discovery/prerank";
import { cleanText, extractText, matchedTerms, termPresent } from "../../src/discovery/prerank/text";
import { MIN_TEXT_CHARS } from "../../src/discovery/prerank/config";
import { runStage3 } from "../../src/discovery/orchestrator/orchestrator";
import { createMemoryHealthStore } from "../../src/discovery/orchestrator/health-store";
import { preferencesToVocabulary } from "../../src/discovery/orchestrator";
import type { SourceTableEntry, Stage3RunDeps } from "../../src/discovery/orchestrator/types";
import { loadBaseline, DEFAULT_PREFERENCES_PATH } from "../../src/discovery/scope";
import type { GeoPreference, Preferences } from "../../src/discovery/scope/types";
import { partitionByGeo } from "../../src/discovery/geo";

const RAW = join(__dirname, "raw");
const NOW = "2026-08-06T12:00:00.000Z";

const fakeSourceDeps: SourceDeps = {
  httpGet: async (url: string) => {
    const m = url.match(/boards\/([a-z]+)\/jobs/);
    if (!m) throw new Error("unexpected url " + url);
    return { status: 200, body: readFileSync(join(RAW, `gh-${m[1]}.json`), "utf8") };
  },
  httpPost: async () => { throw new Error("no POST expected"); },
  now: () => new Date(NOW),
};

// In-memory v3 preferences: real confirmed fields/seniority from the v2 file
// (baseline read), geo constructed in memory per the operator's stated plan.
const baseline = loadBaseline(DEFAULT_PREFERENCES_PATH);
const GEO: GeoPreference = { eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" };
const prefs: Preferences = {
  version: 3,
  generated_at: NOW,
  confirmed_at: NOW,
  fields: baseline.fields,
  work_types: baseline.work_types,
  remote_only: true,
  seniority: baseline.seniority!,
  geo: GEO,
  role_types: [],
};
const vocabulary = preferencesToVocabulary(prefs);

const entry: SourceTableEntry = {
  name: "greenhouse",
  enabled: true,
  sink: "pipeline",
  family: "company_board",
  build: () =>
    createCompanyBoardSource(
      greenhouseAdapter,
      COMPANY_REGISTRY.filter((e) => e.platform === "greenhouse")
    ),
};

function deps(geo: GeoPreference | null): Stage3RunDeps {
  return {
    entries: [entry],
    sourceDeps: fakeSourceDeps,
    vocabulary,
    geo,
    health: createMemoryHealthStore(),
    writeCalendar: () => ({ written: 0, refused: [] }),
    processItem: async () => { throw new Error("dry run — never called"); },
    buildContext: {},
    dryRun: true,
  };
}

// IDF-fallback analysis over the batch prerank would score (post negative/location gates).
function idfFallbackAnalysis(items: RawItem[], label: string): void {
  const terms = [...new Set([...vocabulary.domainTerms, ...vocabulary.roleTerms])];
  const survivors = items
    .map((item) => ({ item, text: cleanText(extractText(item)) }))
    .filter((c) => c.text.length >= MIN_TEXT_CHARS)
    .filter((c) => !vocabulary.negativeTerms.some((t) => termPresent(c.text, t)));
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, survivors.filter((c) => termPresent(c.text, t)).length);
  const present = terms.filter((t) => (df.get(t) ?? 0) > 0);
  const maxAchievable = present.reduce(
    (sum, t) => sum + Math.log((survivors.length + 1) / ((df.get(t) ?? 0) + 1)),
    0
  );
  const fires = maxAchievable === 0 && present.length > 0;
  console.log(
    `  [${label}] scored batch=${survivors.length}, present terms=${present.length}, ` +
      `maxAchievable=${maxAchievable.toFixed(4)} → homogeneous fallback ${fires ? "FIRES (plain overlap)" : "does NOT fire (IDF active)"}`
  );
  if (!fires && survivors.length > 0) {
    const zeroIdf = present.filter((t) => df.get(t) === survivors.length);
    console.log(`  [${label}] terms at idf=0 (in every item): ${zeroIdf.join(", ") || "(none)"}`);
  }
}

async function main(): Promise<void> {
  console.log("=== CONTROL (geo: null — filter off) ===");
  const control = await runStage3(deps(null));
  const cg = control.sources[0];
  console.log(`fetched ${cg.fetched} · deduped ${cg.deduped} · geo block: ${JSON.stringify(control.geo)}`);
  console.log(`prerank: ${JSON.stringify(control.prerank)}`);

  console.log("\n=== GEO ARM (IN, worldwide ok, unresolved pass) ===");
  const geoRun = await runStage3(deps(GEO));
  const gg = geoRun.sources[0];
  console.log(`fetched ${gg.fetched} · deduped ${gg.deduped}`);
  console.log(`geo block: ${JSON.stringify(geoRun.geo)}`);
  console.log(`per-source: ineligible ${gg.geoIneligible} · unresolved ${gg.geoUnresolved} · unknown ${gg.geoUnknownSource}`);
  console.log(`prerank: ${JSON.stringify(geoRun.prerank)}`);

  // ── Membership detail (runStage3 exposes counts only — recorded limitation).
  // Reconstruct the identical deduped batch and partition it with the same
  // shipped modules to show sets, then prerank both arms directly.
  const source = entry.build();
  const fetched = await source.fetch(fakeSourceDeps);
  const seen = new Set<string>();
  const deduped: RawItem[] = [];
  for (const item of fetched.items) {
    const f = normalize(item).fingerprint;
    if (!seen.has(f)) { seen.add(f); deduped.push(item); }
  }
  const partition = partitionByGeo(deduped, () => "greenhouse", GEO);
  const title = (i: RawItem): string => String((i.raw_payload as any).title);
  const loc = (i: RawItem): string => String((i.raw_payload as any).location?.name ?? "?");

  console.log("\n-- geo-arm ELIGIBLE items --");
  partition.eligible.forEach((i) => console.log(`   ${title(i)} @@ ${loc(i)}`));
  console.log("-- geo-arm UNRESOLVED items (passed under 'pass') --");
  partition.unresolved.forEach((u) => console.log(`   ${title(u.item)} @@ ${loc(u.item)} [raw="${u.signal.raw}"]`));

  const geoBatch = [...partition.eligible, ...partition.unresolved.map((u) => u.item)];
  const geoPrerank = prerank({ items: geoBatch, vocabulary }, { now: () => new Date(NOW) });
  console.log("\n-- geo-arm prerank PASSED set --");
  geoPrerank.passed.forEach((i) => console.log(`   ${title(i)} @@ ${loc(i)}`));
  console.log(`-- geo-arm gatedByReason: ${JSON.stringify(geoPrerank.stats.gatedByReason)}`);

  const controlPrerank = prerank({ items: deduped, vocabulary }, { now: () => new Date(NOW) });
  console.log(`\n-- control gatedByReason: ${JSON.stringify(controlPrerank.stats.gatedByReason)}`);

  // ── Amendment: IDF regime observation, both arms.
  console.log("\n=== IDF / fallback regime ===");
  idfFallbackAnalysis(deduped, "control 324");
  idfFallbackAnalysis(geoBatch, "geo-filtered");

  // ── Duplicate-group dissolution check (Track 2d expectation).
  const stripGeo = (t: string): string =>
    t
      .replace(/\s*\|\s*[^|]*\s*\|\s*Remote\s*$/i, "")
      .replace(/\s*\|\s*Remote\s*$/i, "")
      .trim()
      .toLowerCase();
  const groups = new Map<string, number>();
  for (const i of geoPrerank.passed) {
    const k = stripGeo(title(i));
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const dupGroups = [...groups.entries()].filter(([, n]) => n > 1);
  console.log(`\nduplicate groups in geo-arm passed set: ${dupGroups.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
