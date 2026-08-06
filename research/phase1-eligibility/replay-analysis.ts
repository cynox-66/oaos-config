// replay-analysis.ts — RESEARCH ARTIFACT (phase1-eligibility session, 2026-08-06)
// Replays the four Greenhouse board payloads captured on disk through the REAL
// adapter → normalize → prerank chain. Zero network, zero Gemini, zero writes.
// Reads preferences.json READ-ONLY via the real loader.
// Run: npx tsx research/phase1-eligibility/replay-analysis.ts
// Excluded from vitest by filename (no .test./.spec.).

import { readFileSync } from "fs";
import { join } from "path";
import { greenhouseAdapter } from "../../src/discovery/stage3/adapters/greenhouse";
import { COMPANY_REGISTRY } from "../../src/discovery/stage3/registry";
import type { SourceDeps } from "../../src/discovery/stage3/types";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";
import { prerank } from "../../src/discovery/prerank";
import { preferencesToVocabulary } from "../../src/discovery/orchestrator";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../src/discovery/scope";

const RAW = join(__dirname, "raw");

const fakeDeps: SourceDeps = {
  httpGet: async (url: string) => {
    const m = url.match(/boards\/([a-z]+)\/jobs/);
    if (!m) throw new Error("unexpected url " + url);
    return { status: 200, body: readFileSync(join(RAW, `gh-${m[1]}.json`), "utf8") };
  },
  httpPost: async () => { throw new Error("no POST expected"); },
  now: () => new Date("2026-08-06T12:00:00Z"),
};

// Country extraction from Greenhouse location.name (research-grade, from the
// Amendment A census — NOT production code).
const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "US", usa: "US", "san francisco, ca": "US", chicago: "US",
  "chicago, il": "US", boston: "US", "san francisco, usa": "US",
  "united kingdom": "UK", uk: "UK",
  "republic of ireland": "IE", ireland: "IE",
  spain: "ES", sweden: "SE", germany: "DE", netherlands: "NL",
  "the netherlands": "NL", amsterdam: "NL", france: "FR", switzerland: "CH",
  israel: "IL", "tel aviv": "IL", india: "IN", bangalore: "IN", japan: "JP",
  tokyo: "JP", canada: "CA", "toronto or montreal": "CA", singapore: "SG",
  australia: "AU", melbourne: "AU", "mainland china": "CN", denmark: "DK",
  brazil: "BR", "colombia or argentina": "LATAM-multi",
  "singapore or australia": "SG/AU", emea: "REGION-EMEA", europe: "REGION-EU",
};
function extractCountry(locName: string): string | null {
  const cleaned = locName.toLowerCase()
    .replace(/\s*[-–]\s*remote/g, "").replace(/\(?\bremote\b\)?/g, "")
    .replace(/\(?\bhybrid\b\)?/g, "").replace(/[()]/g, "")
    .replace(/\s+/g, " ").trim().replace(/;.*$/, ""); // first segment of multi
  if (!cleaned) return null;
  if (COUNTRY_ALIASES[cleaned]) return COUNTRY_ALIASES[cleaned];
  // hybrid form "city, province, country" — take last comma segment
  const last = cleaned.split(",").map(s => s.trim()).pop()!;
  return COUNTRY_ALIASES[last] ?? null;
}
// multi-value: eligible if ANY segment maps to IN
function indiaEligible(locName: string): "yes" | "no" | "unresolved" {
  const segs = locName.split(";").map(s => s.trim());
  let any = false, unresolved = false;
  for (const s of segs) {
    const c = extractCountry(s);
    if (c === "IN") any = true;
    else if (c === null) unresolved = true;
  }
  return any ? "yes" : unresolved ? "unresolved" : "no";
}

async function main() {
  const entries = COMPANY_REGISTRY.filter(e => e.platform === "greenhouse" && e.enabled);
  let items: RawItem[] = [];
  for (const e of entries) items = items.concat(await greenhouseAdapter.fetchOne(e, fakeDeps));
  console.log("fetched (RawItems):", items.length);

  // normalize + fingerprint
  const now = { now: () => new Date("2026-08-06T12:00:00Z") };
  const normed = items.map(i => ({ item: i, opp: normalize(i) }));
  // dedupe keeping first, tracking group sizes
  const groups = new Map<string, typeof normed>();
  for (const n of normed) {
    const g = groups.get(n.opp.fingerprint) ?? [];
    g.push(n); groups.set(n.opp.fingerprint, g);
  }
  const deduped = [...groups.values()].map(g => g[0]);
  console.log("deduped fingerprints:", deduped.length, "| within-run dupes removed:", items.length - deduped.length);

  // ---- regional-variant detection over the DEDUPED set ----
  // A regional variant group = same company + same title with the location
  // segment stripped, but >1 distinct fingerprint. Title convention: Grafana
  // uses "Role | Country | Remote"; ClickHouse suffixes "- Canada" etc.
  const stripGeo = (title: string) => {
    let t = title;
    t = t.replace(/\s*\|\s*[^|]*\s*\|\s*Remote\s*$/i, "");         // "| X | Remote"
    t = t.replace(/\s*\|\s*Remote\s*$/i, "");
    t = t.replace(/\s*[-–]\s*(Canada|UK|USA?|EMEA|APJ|APAC|India|Germany|Netherlands|Singapore|Australia|Japan|Israel|Brazil|France|Spain|Sweden|Ireland|Denmark|CEUR|Nordics?|Benelux|DACH|East|West|Central|Northeast|Southeast|NORAM|LATAM)\s*$/i, "");
    return t.trim().toLowerCase().replace(/\s+/g, " ");
  };
  const byStripped = new Map<string, typeof deduped>();
  for (const d of deduped) {
    const raw = d.item.raw_payload as Record<string, unknown>;
    const key = (d.opp.company || "?") + "###" + stripGeo(String(raw.title ?? d.opp.role));
    const g = byStripped.get(key) ?? []; g.push(d); byStripped.set(key, g);
  }
  const variantGroups = [...byStripped.entries()].filter(([, g]) => g.length > 1);
  const variantMembers = variantGroups.reduce((a, [, g]) => a + g.length, 0);
  console.log("\nregional/suffix variant groups (deduped set):", variantGroups.length,
    "| members:", variantMembers, "| excess slots consumed:", variantMembers - variantGroups.length);
  for (const [k, g] of variantGroups.sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    const locs = g.map(x => String(((x.item.raw_payload as any).location?.name) ?? "?"));
    console.log(`  ${g.length}× ${k.split("###")[1]} [${k.split("###")[0]}] → ${locs.join(" / ")}`);
  }

  // ---- prerank: control (real current behavior incl. seniority exclusions) ----
  const prefs = loadPreferences(DEFAULT_PREFERENCES_PATH);
  const vocab = preferencesToVocabulary(prefs);
  const batch = deduped.map(d => d.item);
  const control = prerank({ items: batch, vocabulary: vocab }, now);
  console.log("\nCONTROL prerank: in", batch.length, "passed", control.passed.length, "gated", control.gated.length);

  const describe = (it: RawItem) => {
    const p = it.raw_payload as any;
    return `${p.title} @@ ${p.company ?? p.company_name ?? "?"} @@ ${p.location?.name ?? "?"}`;
  };
  console.log("\n-- control passed 25 (title @@ company @@ location) --");
  control.passed.forEach(p => console.log("  ", describe(p)));

  // ---- Amendment C: geo filter applied BEFORE prerank ----
  const geoOf = (it: RawItem) => indiaEligible(String((it.raw_payload as any).location?.name ?? ""));
  const eligible = batch.filter(i => geoOf(i) !== "no");
  const unresolved = batch.filter(i => geoOf(i) === "unresolved");
  console.log("\nGEO FILTER over deduped batch:", batch.length, "→ eligible-or-unresolved", eligible.length,
    "(explicit yes:", batch.filter(i => geoOf(i) === "yes").length, "| unresolved:", unresolved.length + ")");
  unresolved.forEach(i => console.log("   unresolved:", describe(i)));
  const geo = prerank({ items: eligible, vocabulary: vocab }, now);
  console.log("\nGEO-FILTERED prerank: in", eligible.length, "passed", geo.passed.length, "gated", geo.gated.length);
  console.log("-- geo-filtered passed set --");
  geo.passed.forEach(p => console.log("  ", describe(p)));

  // how many of control's passed 25 are geo-ineligible?
  const controlIneligible = control.passed.filter(p => geoOf(p) === "no");
  console.log("\ncontrol passed items that are geo-INELIGIBLE:", controlIneligible.length, "of", control.passed.length);

  // regional variants within control passed
  const passedKeys = new Map<string, number>();
  for (const p of control.passed) {
    const raw = p.raw_payload as any;
    const k = stripGeo(String(raw.title ?? ""));
    passedKeys.set(k, (passedKeys.get(k) ?? 0) + 1);
  }
  const dupInPassed = [...passedKeys.entries()].filter(([, c]) => c > 1);
  console.log("regional-variant groups inside control passed:", dupInPassed.length,
    "| slots on duplicates:", dupInPassed.reduce((a, [, c]) => a + c, 0));
  dupInPassed.forEach(([k, c]) => console.log(`   ${c}× ${k}`));

  // ---- Track 3a: GTM roles' prerank scores + matched terms ----
  const { extractText, cleanText, matchedTerms } = await import("../../src/discovery/prerank/text");
  const GTM = [/commercial account executive/i, /field marketing manager/i, /partner se technology alliances|partner sales engineer/i, /solutions engineer/i, /account executive/i, /sales development/i, /marketing/i];
  console.log("\n-- GTM-titled items in deduped batch: prerank score + matched vocab terms --");
  const scored = new Map(control.gated.filter(g => g.score !== null).map(x => [x.item, x.score]));
  const allVocabTerms = [...new Set([...vocab.domainTerms, ...vocab.roleTerms])];
  for (const d of deduped) {
    const raw = d.item.raw_payload as any;
    const title = String(raw.title ?? "");
    if (!GTM.some(p => p.test(title))) continue;
    const text = cleanText(extractText(d.item));
    const matched = matchedTerms(text, allVocabTerms);
    const inPassed = control.passed.some(p => p === d.item);
    console.log(`  [${inPassed ? "PASSED" : "gated "}] score=${inPassed ? "(passed)" : scored.get(d.item) ?? "n/a"} | ${title.slice(0, 55)} @@ ${raw.location?.name}\n      terms(${matched.length}): ${matched.join(", ")}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });