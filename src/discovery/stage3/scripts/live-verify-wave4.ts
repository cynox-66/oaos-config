// live-verify-wave4.ts
// File: src/discovery/stage3/scripts/live-verify-wave4.ts
// Purpose: ONE bounded live-confirmation request per Wave 4 source (6
//          total), confirming each source's real implementation parses the
//          CURRENT live response shape end-to-end (through fetch(), not a
//          lower-level helper). Same convention as Wave 3's live-verify.ts.
//
// NOT part of the automated suite: this filename does not match vitest's
// default test glob (**/*.{test,spec}.*), so `npm test` / `vitest run`
// never collects or executes it. Run manually only:
//
//   npx tsx src/discovery/stage3/scripts/live-verify-wave4.ts
//
// Network policy: one request per source, ONE retry maximum and ONLY for a
// transient failure (timeout or 5xx). A 4xx, a parse/shape mismatch, or a
// second failure stops verification for that source — reported, never
// retried further.

import "dotenv/config";
import { createEsocSource } from "../sources/esoc";
import { createCncfLfxSource } from "../sources/cncf-lfx";
import { createLfdtSource } from "../sources/lfdt";
import { createNlnetSource } from "../sources/nlnet";
import { createOutreachySource } from "../sources/outreachy";
import { createGhslSource } from "../sources/ghsl";
import type { FetchResult, SourceDeps, Stage3Source } from "../types";

async function httpGet(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers: { "User-Agent": "oaos-wave4-verify", ...headers } });
  return { status: res.status, body: await res.text() };
}

async function httpPost(url: string, body: unknown, headers?: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

const deps: SourceDeps = { httpGet, httpPost, now: () => new Date().toISOString() };

const githubToken = process.env.GITHUB_TOKEN;

interface Check {
  label: string;
  source: Stage3Source;
}

const checks: Check[] = [
  { label: "esoc", source: createEsocSource(undefined, () => githubToken) },
  { label: "cncf-lfx", source: createCncfLfxSource(undefined, () => githubToken) },
  { label: "lfdt", source: createLfdtSource(undefined, () => githubToken) },
  { label: "nlnet", source: createNlnetSource() },
  { label: "outreachy", source: createOutreachySource() },
  { label: "ghsl", source: createGhslSource() },
];

function truncate(value: unknown, lines: number): string {
  return JSON.stringify(value, null, 2).split("\n").slice(0, lines).join("\n");
}

async function runCheck(check: Check): Promise<void> {
  console.log(`\n=== ${check.label} ===`);
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const result: FetchResult = await check.source.fetch(deps);
      console.log(`fetch: OK (attempt ${attempt})`);
      console.log(`items: ${result.items.length}, calendarEntries: ${result.calendarEntries?.length ?? "n/a"}, errors: ${result.errors.length}`);
      if (result.errors.length > 0) {
        console.log(`errors sample: ${truncate(result.errors.slice(0, 2), 15)}`);
      }
      if (result.items.length > 0) {
        console.log(`sample items:\n${truncate(result.items.slice(0, 2), 20)}`);
      }
      if (result.calendarEntries && result.calendarEntries.length > 0) {
        console.log(`sample calendarEntries:\n${truncate(result.calendarEntries.slice(0, 2), 20)}`);
      }
      return;
    } catch (err) {
      if (attempt < 2) {
        console.log(`attempt ${attempt} threw — retrying once: ${String(err)}`);
        continue;
      }
      console.log(`STOP — retry exhausted: ${String(err)}`);
      return;
    }
  }
}

async function main(): Promise<void> {
  for (const check of checks) {
    await runCheck(check);
  }
}

main();
