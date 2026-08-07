// probe-facet.ts — Q2: does the Himalayas SEARCH API accept an
// experience/seniority facet on the request?
//
// STRATEGY: one request carrying EVERY plausible param name at once, against a
// term whose same-day baseline is already captured (sweep-02-kubernetes.json,
// totalCount 31 / 20 jobs). A negative result settles all names in one
// request, which is the likely outcome and the cheap one. A drop in
// totalCount means SOMETHING is honoured, and probe 15 isolates which.
//
// COST: 1 live request per invocation. ZERO Gemini, ZERO writes.
// Run: npx tsx research/experience-eligibility/probe-facet.ts

import { writeFileSync } from "node:fs";
import { createSourceDeps } from "../../src/discovery/orchestrator";

const deps = createSourceDeps();
const BASE = "https://himalayas.app/jobs/api/search";

const url = process.argv[2] ?? `${BASE}?${[
  "q=kubernetes",
  "seniority=Entry-level",
  "seniorityLevel=Entry-level",
  "experience=entry-level",
  "experienceLevel=entry-level",
  "level=entry-level",
  "minYears=0",
  "maxYears=1",
].join("&")}`;

const tag = process.argv[3] ?? "combined";

async function main(): Promise<void> {
  const res = await deps.httpGet(url, {});
  console.log(`${res.status} ${url}`);
  writeFileSync(`${import.meta.dirname}/raw/facet-${tag}.json`, res.body);
  try {
    const d = JSON.parse(res.body) as Record<string, unknown>;
    const jobs = (d.jobs as { seniority?: string[]; title?: string }[]) ?? [];
    console.log(`  totalCount=${d.totalCount} jobs=${jobs.length} limit=${d.limit} offset=${d.offset}`);
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const k = JSON.stringify(j.seniority ?? null);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    console.log(`  seniority mix of returned jobs: ${JSON.stringify([...counts])}`);
    console.log(`  BASELINE (same-day sweep, q=kubernetes bare): totalCount=31 jobs=20`);
  } catch {
    console.log(`  non-JSON body, first 300 chars:\n${res.body.slice(0, 300)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
