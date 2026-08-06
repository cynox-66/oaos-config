// analyze-dryrun.ts — Wave 8 (Himalayas activation) membership analysis.
//
// WHY THIS EXISTS: `runStage3` returns COUNTS only — no items, no fingerprints
// (the limitation recorded in the seniority and G1 wave entries). The CLI
// dry-run is therefore authoritative for the counts, but cannot show WHICH
// items passed, their geo signals, or prerank's IDF internals. This script
// fetches the same corpus once and replays it through the SAME shipped
// modules (real sources, real normalize, real geo mapper, real prerank, real
// vocabulary from the operator's confirmed v3 scope) to report that detail.
//
// COST: 17 live requests (4 greenhouse boards + 13 himalayas scope terms).
// No healthCheck, so it does not repeat #16's 2x. ZERO Gemini. ZERO writes.
// preferences.json is READ-ONLY via the real loader.
//
// Run: npx tsx research/wave8-himalayas/analyze-dryrun.ts
// Excluded from `vitest run` by filename (no .test./.spec.), same convention
// as live-verify*.ts / verify-seniority.ts / verify-g1-replay.ts.

import { greenhouseAdapter } from "../../src/discovery/stage3/adapters/greenhouse";
import { createCompanyBoardSource } from "../../src/discovery/stage3/company-board";
import { COMPANY_REGISTRY } from "../../src/discovery/stage3/registry";
import { createHimalayasSource } from "../../src/discovery/stage3/sources/himalayas";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";
import { prerank } from "../../src/discovery/prerank";
import { MIN_TEXT_CHARS } from "../../src/discovery/prerank/config";
import { cleanText, extractText, termPresent } from "../../src/discovery/prerank/text";
import type { GatedItem } from "../../src/discovery/prerank/types";
import { createSourceDeps, preferencesToVocabulary } from "../../src/discovery/orchestrator";
import { geoOf, itemsPassingGeo, partitionByGeo } from "../../src/discovery/geo";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../src/discovery/scope";

const prefs = loadPreferences(DEFAULT_PREFERENCES_PATH);
const vocabulary = preferencesToVocabulary(prefs);
const geo = prefs.geo;
if (!geo) throw new Error("this analysis assumes an active geo scope");

const deps = createSourceDeps();

function title(item: RawItem): string {
  const p = item.raw_payload as Record<string, unknown>;
  return String(p.title ?? "(no title)");
}
function company(item: RawItem): string {
  const p = item.raw_payload as Record<string, unknown>;
  return String(p.company ?? p.company_name ?? p.companyName ?? "?");
}

async function main(): Promise<void> {
  // ── 1. Fetch through the REAL sources, in source-table order ─────────────
  const greenhouse = createCompanyBoardSource(
    greenhouseAdapter,
    COMPANY_REGISTRY.filter((e) => e.platform === "greenhouse"),
    true
  );
  const himalayas = createHimalayasSource(undefined, prefs);

  const ghFetch = await greenhouse.fetch(deps);
  const himFetch = await himalayas.fetch(deps);
  console.log(`fetched: greenhouse ${ghFetch.items.length}, himalayas ${himFetch.items.length}`);
  for (const e of [...ghFetch.errors, ...himFetch.errors]) {
    console.log(`  fetch error [${e.scope}/${e.kind}] ${e.detail}`);
  }

  // ── 2. Within-run dedupe, exactly as the orchestrator does it ────────────
  const owner = new Map<RawItem, string>();
  const seen = new Set<string>();
  const deduped: RawItem[] = [];
  const dedupedBy: Record<string, number> = { greenhouse: 0, himalayas: 0 };
  for (const [name, fetched] of [
    ["greenhouse", ghFetch],
    ["himalayas", himFetch],
  ] as const) {
    for (const item of fetched.items) {
      const f = normalize(item).fingerprint;
      if (seen.has(f)) {
        dedupedBy[name] += 1;
        continue;
      }
      seen.add(f);
      owner.set(item, name);
      deduped.push(item);
    }
  }
  console.log(
    `deduped: greenhouse ${dedupedBy.greenhouse}, himalayas ${dedupedBy.himalayas} ` +
      `→ ${deduped.length} into geo`
  );

  // ── 3. Geo partition (real module) ──────────────────────────────────────
  const sourceOf = (i: RawItem): string => owner.get(i) ?? "";
  const partition = partitionByGeo(deduped, sourceOf, geo);
  const prerankInput = itemsPassingGeo(partition, geo);
  const perSource = (items: RawItem[]): string =>
    `gh ${items.filter((i) => sourceOf(i) === "greenhouse").length} / him ${items.filter((i) => sourceOf(i) === "himalayas").length}`;
  console.log(
    `geo: ${deduped.length} in → eligible ${partition.eligible.length} (${perSource(partition.eligible)}), ` +
      `ineligible ${partition.ineligible.length}, unresolved ${partition.unresolved.length}, ` +
      `unknown_source ${partition.unknown.length} → ${prerankInput.length} into prerank`
  );

  // ── 4. IDF internals — read-only replication of prerank's own formula ────
  const terms = [...new Set([...vocabulary.domainTerms, ...vocabulary.roleTerms])];
  const scored = prerankInput
    .map((item) => ({ item, text: cleanText(extractText(item)) }))
    .filter((c) => c.text.length >= MIN_TEXT_CHARS)
    .filter((c) => !vocabulary.negativeTerms.some((t) => termPresent(c.text, t)));
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, scored.filter((c) => termPresent(c.text, t)).length);
  const present = terms.filter((t) => (df.get(t) ?? 0) > 0);
  const idf = new Map<string, number>();
  for (const t of present) idf.set(t, Math.log((scored.length + 1) / ((df.get(t) ?? 0) + 1)));
  const maxAchievable = present.reduce((s, t) => s + (idf.get(t) ?? 0), 0);
  const zeroIdf = present.filter((t) => (idf.get(t) ?? 0) === 0);
  console.log(
    `\nIDF: scored batch ${scored.length} (post insufficient_text + negative_term), ` +
      `present terms ${present.length}/${terms.length}, maxAchievable ${maxAchievable.toFixed(4)} → ` +
      `homogeneous fallback ${maxAchievable === 0 && present.length > 0 ? "FIRES (plain overlap)" : "does NOT fire (IDF active)"}`
  );
  console.log(`IDF: terms at idf=0 (present in EVERY scored item): ${zeroIdf.length ? zeroIdf.join(", ") : "(none)"}`);

  // ── 5. Real prerank ─────────────────────────────────────────────────────
  const result = prerank({ items: prerankInput, vocabulary }, { now: () => new Date() });
  console.log(
    `\nprerank: ${prerankInput.length} in → ${result.passed.length} passed (${perSource(result.passed)}), ` +
      `${result.gated.length} gated ${JSON.stringify(result.stats.gatedByReason)}`
  );

  const signalOf = (i: RawItem) => geoOf(sourceOf(i), i, geo);
  console.log("\n-- PASSED SET (source | title | geo status | raw geo value) --");
  for (const i of result.passed) {
    const s = signalOf(i);
    console.log(
      `  [${sourceOf(i).padEnd(10)}] ${title(i).slice(0, 58)}  @@ ${company(i).slice(0, 20)}\n` +
        `        geo=${s.status} raw="${s.raw}" → ${s.countries.join(",") || "(none)"}`
    );
  }

  console.log("\n-- GEO-ELIGIBLE ITEMS THAT PRERANK GATED (item | reason | score) --");
  const gatedEligible = (result.gated as GatedItem[]).filter(
    (g) => signalOf(g.item).status !== "ineligible"
  );
  for (const g of gatedEligible) {
    const s = signalOf(g.item);
    console.log(
      `  [${sourceOf(g.item).padEnd(10)}] ${title(g.item).slice(0, 58)}\n` +
        `        reason=${g.reason} score=${g.score ?? "n/a"} geo=${s.status} raw="${s.raw}"`
    );
  }
  console.log(`\n(below_floor fired: ${(result.stats.gatedByReason.below_floor ?? 0) > 0 ? "YES" : "NO"}; ` +
    `beyond_k: ${result.stats.gatedByReason.beyond_k ?? 0} — maxPerRun ${
      (result.stats.gatedByReason.beyond_k ?? 0) > 0 ? "BOUND" : "did not bind"
    })`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
