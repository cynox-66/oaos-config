// capture.ts — Experience-eligibility probe, Step 0 capture.
//
// Fetches the Himalayas corpus ONCE through the REAL shipped source
// (createHimalayasSource + the operator's confirmed v3 scope) and persists
// every raw response body, so every later question is answered offline.
//
// COST: 13 live requests (one per enabled scope term). No healthCheck.
// ZERO Gemini. ZERO writes. preferences.json READ-ONLY via the real loader.
//
// Run: npx tsx research/experience-eligibility/capture.ts
// Excluded from `vitest run` by filename, same convention as live-verify*.ts.

import { writeFileSync } from "node:fs";
import { createHimalayasSource } from "../../src/discovery/stage3/sources/himalayas";
import { createSourceDeps } from "../../src/discovery/orchestrator";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../src/discovery/scope";
import type { SourceDeps } from "../../src/discovery/stage3/types";

const RAW = `${import.meta.dirname}/raw`;

const prefs = loadPreferences(DEFAULT_PREFERENCES_PATH);
const real = createSourceDeps();

const ledger: { n: number; url: string; status: number; bytes: number }[] = [];
let n = 0;

// Recording wrapper — the source is untouched; only the injected dep records.
const deps: SourceDeps = {
  ...real,
  httpGet: async (url, headers) => {
    const res = await real.httpGet(url, headers);
    n += 1;
    const term = new URL(url).searchParams.get("q") ?? `req${n}`;
    writeFileSync(`${RAW}/sweep-${String(n).padStart(2, "0")}-${term.replace(/\W+/g, "_")}.json`, res.body);
    ledger.push({ n, url, status: res.status, bytes: res.body.length });
    console.log(`  [${n}] ${res.status} ${url} (${res.body.length} bytes)`);
    return res;
  },
};

async function main(): Promise<void> {
  const source = createHimalayasSource(undefined, prefs);
  console.log("fetching himalayas through the real source...");
  const result = await source.fetch(deps);
  console.log(`\nfetched ${result.items.length} items (post within-source dedupe), ${result.errors.length} errors`);
  for (const e of result.errors) console.log(`  error [${e.scope}/${e.kind}] ${e.detail}`);

  writeFileSync(
    `${RAW}/../ledger.json`,
    JSON.stringify({ capturedAt: new Date().toISOString(), requests: ledger }, null, 2)
  );
  console.log(`\nledger: ${ledger.length} requests written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
