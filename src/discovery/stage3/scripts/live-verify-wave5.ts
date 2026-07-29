// live-verify-wave5.ts
// File: src/discovery/stage3/scripts/live-verify-wave5.ts
// Purpose: Bounded live confirmation for the Wave 5 query_net sources —
//          each source's REAL implementation against the CURRENT live API,
//          through fetch(), not a lower-level helper.
//
// NOT part of the automated suite: this filename does not match vitest's
// default test glob (**/*.{test,spec}.*), so `npm test` / `vitest run` never
// collects or executes it. Run manually only:
//
//   npx tsx src/discovery/stage3/scripts/live-verify-wave5.ts
//
// ── REQUEST BUDGET, and why it is not "one per source" ──────────────────────
// A query_net source issues one request PER SCOPE TERM. Running all five at
// the operator's 13-field scope would be 42 requests just to confirm shapes.
// So this script runs each source against a ONE-TERM scope: 1 request each for
// himalayas/freehire/adzuna, 2 for hn-hiring (thread search + thread body).
//
// REMOTIVE IS EXCLUDED BY DEFAULT. Its documented etiquette is a few calls per
// day and the adapter hard-caps it at one, which this script would spend — and
// spend against the operator's real discovery/remotive.json, affecting the next
// real run. Pass --with-remotive to include it deliberately.
//
// Network policy: one request per query, ONE retry maximum and ONLY for a
// transient failure (timeout or 5xx). A 4xx, a parse/shape mismatch, or a
// second failure stops verification for that source — reported, never retried.

import "dotenv/config";
import { resolve } from "node:path";
import { loadPreferences, DEFAULT_PREFERENCES_PATH } from "../../scope";
import { createHimalayasSource } from "../sources/himalayas";
import { createFreehireSource } from "../sources/freehire";
import { createAdzunaSource } from "../sources/adzuna";
import { createRemotiveSource } from "../sources/remotive";
import { createHnHiringSource } from "../sources/hn-hiring";
import { createRemotiveStore } from "../query/remotive-state";
import type { Preferences } from "../../scope/types";
import type { SourceDeps, Stage3Source } from "../types";

const deps: SourceDeps = {
  httpGet: async (url, headers) => {
    const res = await fetch(url, { headers: { "User-Agent": "oaos-wave5-verify", ...headers } });
    return { status: res.status, body: await res.text() };
  },
  httpPost: async (url, body, headers) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text() };
  },
  now: () => new Date().toISOString(),
};

/**
 * A one-term view of the operator's REAL confirmed scope. Read-only — this
 * script never writes preferences.json, and never invents one.
 */
function oneTermScope(preferences: Preferences, preferred: string): Preferences {
  const enabled = preferences.fields.filter((f) => f.enabled);
  const pick = enabled.find((f) => f.name.toLowerCase() === preferred.toLowerCase()) ?? enabled[0];
  if (!pick) throw new Error("preferences.json has no enabled field — nothing to verify against");
  return { ...preferences, fields: [pick] };
}

async function verify(source: Stage3Source): Promise<void> {
  const label = source.name;
  try {
    const result = await source.fetch(deps);
    const truncated = result.items.filter(
      (i) => typeof i.raw_payload === "object" && (i.raw_payload as Record<string, unknown>).content_truncated === true
    ).length;

    console.log(
      `${label}: ${result.items.length} items, ${result.errors.length} errors` +
        (truncated > 0 ? `, ${truncated} content-quarantined` : "")
    );
    for (const e of result.errors) console.log(`  ! ${e.scope} [${e.kind}] ${e.detail}`);
    const first = result.items[0];
    if (first) console.log(`  first url: ${first.url}`);
  } catch (err) {
    console.log(`${label}: THREW — ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const withRemotive = process.argv.includes("--with-remotive");
  const preferences = loadPreferences(resolve(process.cwd(), DEFAULT_PREFERENCES_PATH));

  const adzunaAppId = process.env.ADZUNA_APP_ID;
  const adzunaAppKey = process.env.ADZUNA_APP_KEY;

  await verify(createHimalayasSource(undefined, oneTermScope(preferences, "Kubernetes")));
  await verify(createFreehireSource(undefined, oneTermScope(preferences, "Kubernetes")));
  await verify(
    createAdzunaSource(
      undefined,
      oneTermScope(preferences, "Kubernetes"),
      adzunaAppId && adzunaAppKey ? { appId: adzunaAppId, appKey: adzunaAppKey } : undefined
    )
  );
  await verify(createHnHiringSource(undefined, preferences));

  if (withRemotive) {
    console.log("(spending Remotive's one call for today)");
    await verify(createRemotiveSource(undefined, createRemotiveStore()));
  } else {
    console.log("remotive: SKIPPED — pass --with-remotive to spend its one daily call");
  }
}

main().catch((err) => {
  console.error("live-verify-wave5 failed:", err);
  process.exit(1);
});
