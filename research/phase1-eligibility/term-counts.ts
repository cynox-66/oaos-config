// term-counts.ts — research supplement (Track 3a): term counts for passed items
import { readFileSync } from "fs";
import { join } from "path";
import { greenhouseAdapter } from "../../src/discovery/stage3/adapters/greenhouse";
import { COMPANY_REGISTRY } from "../../src/discovery/stage3/registry";
import { normalize } from "../../src/engines/normalization";
import { prerank } from "../../src/discovery/prerank";
import { cleanText, extractText, matchedTerms } from "../../src/discovery/prerank/text";
import { preferencesToVocabulary } from "../../src/discovery/orchestrator";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../src/discovery/scope";
const RAW = join(__dirname, "raw");
const deps = {
  httpGet: async (u: string) => ({ status: 200, body: readFileSync(join(RAW, `gh-${u.match(/boards\/([a-z]+)\//)![1]}.json`), "utf8") }),
  httpPost: async () => { throw new Error("no"); },
  now: () => new Date("2026-08-06T12:00:00Z"),
} as any;
(async () => {
  let items: any[] = [];
  for (const e of COMPANY_REGISTRY.filter(x => x.platform === "greenhouse" && x.enabled)) items = items.concat(await greenhouseAdapter.fetchOne(e, deps));
  const seen = new Set(); const dd: any[] = [];
  for (const i of items) { const f = normalize(i).fingerprint; if (!seen.has(f)) { seen.add(f); dd.push(i); } }
  const vocab = preferencesToVocabulary(loadPreferences(DEFAULT_PREFERENCES_PATH));
  const res = prerank({ items: dd, vocabulary: vocab }, { now: () => new Date("2026-08-06T12:00:00Z") });
  const all = [...new Set([...vocab.domainTerms, ...vocab.roleTerms])];
  console.log("passed items — termCount | title @@ location");
  res.passed.forEach((p: any, i: number) => {
    const t = matchedTerms(cleanText(extractText(p)), all);
    console.log(String(i + 1).padStart(2), String(t.length).padStart(2), "|", p.raw_payload.title.slice(0, 60), "@@", p.raw_payload.location?.name);
  });
})();
