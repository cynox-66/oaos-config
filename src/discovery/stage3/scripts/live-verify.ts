// live-verify.ts
// File: src/discovery/stage3/scripts/live-verify.ts
// Purpose: ONE bounded live-verification request per Wave 3 platform (4 total),
//          confirming each adapter parses the CURRENT live response shape.
//
// NOT part of the automated suite: this filename does not match vitest's
// default test glob (**/*.{test,spec}.*), so `npm test` / `vitest run` never
// collects or executes it — that is the whole exclusion mechanism, there is
// no vitest.config.ts to special-case. Run manually only:
//
//   npx tsx src/discovery/stage3/scripts/live-verify.ts
//
// Network policy (see the Wave 3 task spec / stage3/README.md): one request
// per platform against the real company boards below, ONE retry maximum and
// ONLY for a transient failure (timeout or 5xx). A 4xx, a parse/shape
// mismatch, or a second failure stops verification for that platform — it is
// reported, never retried further, never worked around with alternate
// tokens/URLs.

import { greenhouseAdapter } from "../adapters/greenhouse";
import { leverAdapter } from "../adapters/lever";
import { workdayAdapter } from "../adapters/workday";
import { ashbyAdapter } from "../adapters/ashby";
import { SourceFetchError } from "../company-board";
import type { CompanyRegistryEntry, HttpResponse, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";

async function httpGet(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
  const res = await fetch(url, { method: "GET", headers });
  return { status: res.status, body: await res.text() };
}

async function httpPost(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

const deps: SourceDeps = { httpGet, httpPost, now: () => new Date().toISOString() };

interface Check {
  label: string;
  entry: CompanyRegistryEntry;
  fetchOne: (entry: CompanyRegistryEntry, deps: SourceDeps) => Promise<RawItem[]>;
  researchCount: number;
}

const checks: Check[] = [
  {
    label: "greenhouse:grafanalabs",
    entry: { company: "Grafana Labs", platform: "greenhouse", token: "grafanalabs", enabled: true },
    fetchOne: greenhouseAdapter.fetchOne,
    researchCount: 114,
  },
  {
    label: "lever:sysdig",
    entry: { company: "Sysdig", platform: "lever", token: "sysdig", enabled: true },
    fetchOne: leverAdapter.fetchOne,
    researchCount: 5,
  },
  {
    label: "workday:redhat",
    entry: { company: "Red Hat", platform: "workday", token: "redhat", site: "Jobs", enabled: true },
    fetchOne: workdayAdapter.fetchOne,
    researchCount: 228,
  },
  {
    label: "ashby:signoz",
    entry: { company: "SigNoz", platform: "ashby", token: "signoz", enabled: true },
    fetchOne: ashbyAdapter.fetchOne,
    researchCount: 12,
  },
];

function isTransient(err: unknown): boolean {
  if (err instanceof SourceFetchError) {
    if (err.kind !== "http") return false; // parse/shape are never transient
    const status = Number(/HTTP (\d\d\d)/.exec(err.message)?.[1] ?? "0");
    return status >= 500;
  }
  return true; // a raw thrown error (fetch network failure, timeout) is transient
}

function truncate(value: unknown, lines: number): string {
  return JSON.stringify(value, null, 2).split("\n").slice(0, lines).join("\n");
}

async function runCheck(check: Check): Promise<void> {
  console.log(`\n=== ${check.label} ===`);
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const items = await check.fetchOne(check.entry, deps);
      const drift = items.length - check.researchCount;
      console.log(`http: OK (attempt ${attempt})`);
      console.log(`items parsed: ${items.length} (research: ${check.researchCount}, drift: ${drift >= 0 ? "+" : ""}${drift})`);
      console.log(`sample RawItem:\n${truncate(items[0] ?? null, 15)}`);
      return;
    } catch (err) {
      const transient = isTransient(err);
      const detail = err instanceof SourceFetchError ? `${err.kind}: ${err.message}` : String(err);
      if (transient && attempt < 2) {
        console.log(`attempt ${attempt} failed (transient) — retrying once: ${detail}`);
        continue;
      }
      console.log(`STOP — ${transient ? "retry exhausted" : "non-transient failure, no retry"}: ${detail}`);
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
