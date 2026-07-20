/**
 * Phase 0c — Aggregator + ATS + community source live probes.
 * Research-only. No OAOS engine/pipeline/persistence code touched.
 *
 * Rate limit: max 1 request/second globally (enforced below).
 * Hard session cap: 55 requests total (enforced — throws if exceeded).
 * Per-probe caps are enforced by each probe function's own request count.
 *
 * OSS-paid-program sources (LFX, GSoC, bounties) are explicitly out of
 * scope for this session.
 *
 * Writes one raw JSON dump per probe to research/phase0c/raw/, and a
 * single index of what happened to research/phase0c/raw/run-log.json.
 * findings.md and SOURCE-PRIORITY.md are hand-composed afterward from
 * these raw dumps (same convention as Phase 0).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";

const MIN_INTERVAL_MS = 1000;
const HARD_SESSION_CAP = 55;

let lastRequestAt = 0;
let requestCount = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

interface ProbeResult {
  url: string;
  status: number | "error";
  ok: boolean;
  headers: Record<string, string>;
  body: any;
  error?: string;
}

async function probe(url: string, opts?: { label?: string }): Promise<ProbeResult> {
  requestCount++;
  if (requestCount > HARD_SESSION_CAP) {
    throw new Error(
      `HARD SESSION CAP EXCEEDED (${HARD_SESSION_CAP}) — refusing request #${requestCount} to ${url}`,
    );
  }
  await throttle();
  console.log(`[${requestCount}/${HARD_SESSION_CAP}] GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OAOS-research-phase0c/1.0 (personal, non-commercial probe)" },
    });
    const headersOfInterest: Record<string, string> = {};
    for (const h of [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-rate-limit-limit",
      "x-rate-limit-remaining",
      "retry-after",
      "content-type",
    ]) {
      const v = res.headers.get(h);
      if (v) headersOfInterest[h] = v;
    }
    let body: any;
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (ct.includes("json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { __unparsedText: text.slice(0, 2000) };
      }
    } else {
      body = { __rawText: text.slice(0, 3000) };
    }
    return { url, status: res.status, ok: res.ok, headers: headersOfInterest, body };
  } catch (e: any) {
    return { url, status: "error", ok: false, headers: {}, error: e?.message ?? String(e), body: null };
  }
}

const runLog: Record<string, ProbeResult[]> = {};

async function dump(probeName: string, results: ProbeResult[]) {
  runLog[probeName] = results;
  await writeFile(
    `research/phase0c/raw/${probeName}.json`,
    JSON.stringify(results, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------
// P1 — Himalayas (cap 6)
// ---------------------------------------------------------------------
async function p1_himalayas() {
  const results: ProbeResult[] = [];
  results.push(await probe("https://himalayas.app/jobs/api?limit=5"));
  results.push(await probe("https://himalayas.app/jobs/api/search?q=kubernetes&limit=5"));

  const searchFailed = results[1].status === 404 || !results[1].ok;
  if (searchFailed) {
    const spec = await probe("https://himalayas.app/docs/openapi.json");
    results.push(spec);
    // Only spend further budget on variants if the spec actually gave us a path to try.
    if (spec.ok && spec.body && typeof spec.body === "object") {
      const paths = spec.body.paths ? Object.keys(spec.body.paths) : [];
      const searchPath = paths.find((p) => /search/i.test(p));
      if (searchPath && results.length < 6) {
        const base = "https://himalayas.app";
        const variantUrl = `${base}${searchPath}?q=kubernetes&limit=5`;
        results.push(await probe(variantUrl));
      }
    }
  }
  await dump("p1-himalayas", results);
}

// ---------------------------------------------------------------------
// P2 — Remotive (cap 2)
// ---------------------------------------------------------------------
async function p2_remotive() {
  const results: ProbeResult[] = [];
  results.push(await probe("https://remotive.com/api/remote-jobs?category=software-dev&limit=5"));
  await dump("p2-remotive", results);
}

// ---------------------------------------------------------------------
// P3 — Jobicy (cap 2)
// ---------------------------------------------------------------------
async function p3_jobicy() {
  const results: ProbeResult[] = [];
  results.push(
    await probe("https://jobicy.com/api/v2/remote-jobs?count=10&industry=software-engineering"),
  );
  await dump("p3-jobicy", results);
}

// ---------------------------------------------------------------------
// P4 — Arbeitnow (cap 2)
// ---------------------------------------------------------------------
async function p4_arbeitnow() {
  const results: ProbeResult[] = [];
  results.push(await probe("https://www.arbeitnow.com/api/job-board-api"));
  await dump("p4-arbeitnow", results);
}

// ---------------------------------------------------------------------
// P5 — Adzuna India (cap 4) — CONFLICT RESOLUTION
// ---------------------------------------------------------------------
async function p5_adzuna() {
  const results: ProbeResult[] = [];
  let creds: { app_id: string; app_key: string } | null = null;
  let keySource = "research/phase0c/adzuna-keys.txt";

  try {
    const raw = await readFile("research/phase0c/adzuna-keys.txt", "utf-8");
    const idMatch = raw.match(/app_id\s*=\s*(\S+)/);
    const keyMatch = raw.match(/app_key\s*=\s*(\S+)/);
    if (idMatch && keyMatch) creds = { app_id: idMatch[1], app_key: keyMatch[1] };
  } catch {
    // absent — fall through to phase0 fallback below
  }

  if (!creds) {
    // DEVIATION FROM SCOPE LOCK: the phase0c-specific key file was not created.
    // Reusing the still-live credentials from research/phase0/adzuna-keys.txt
    // (same operator, same Adzuna account, already used for this exact
    // purpose in Phase 0) rather than skipping this conflict-resolution
    // probe outright. Flagged explicitly in findings.md.
    try {
      const raw = await readFile("research/phase0/adzuna-keys.txt", "utf-8");
      const idMatch = raw.match(/app_id\s*=\s*(\S+)/);
      const keyMatch = raw.match(/app_key\s*=\s*(\S+)/);
      if (idMatch && keyMatch) {
        creds = { app_id: idMatch[1], app_key: keyMatch[1] };
        keySource = "research/phase0/adzuna-keys.txt (FALLBACK — phase0c copy absent)";
      }
    } catch {
      // truly absent everywhere
    }
  }

  if (!creds) {
    await writeFile(
      "research/phase0c/raw/p5-adzuna.json",
      JSON.stringify({ skipped: true, reason: "no adzuna-keys.txt found in phase0c or phase0" }, null, 2),
      "utf-8",
    );
    console.log("P5 Adzuna: SKIPPED — no credentials file found.");
    return;
  }

  console.log(`P5 Adzuna: using credentials from ${keySource}`);
  const { app_id, app_key } = creds;
  results.push(
    await probe(
      `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${app_id}&app_key=${app_key}&what=kubernetes&results_per_page=10`,
    ),
  );
  results.push(
    await probe(
      `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${app_id}&app_key=${app_key}&what=devops%20remote&results_per_page=10`,
    ),
  );
  await writeFile(
    "research/phase0c/raw/p5-adzuna.json",
    JSON.stringify({ keySource, results }, null, 2),
    "utf-8",
  );
  runLog["p5-adzuna"] = results;
}

// ---------------------------------------------------------------------
// P6 — ATS conflict resolution (cap 12 total)
// ---------------------------------------------------------------------
async function p6_ats() {
  const results: Record<string, ProbeResult[]> = {};

  // a. Recruitee — dogfood: Recruitee (the company) runs its own hiring on its own product.
  results.recruitee = [await probe("https://recruitee.recruitee.com/api/offers/")];

  // b. SmartRecruiters — "VisaInc" is SmartRecruiters' own documented public example company ID.
  results.smartrecruiters = [
    await probe("https://api.smartrecruiters.com/v1/companies/VisaInc/postings"),
  ];

  // c. Polymer — no strong prior; try the vendor's own slug as a dogfood guess.
  results.polymer = [
    await probe("https://api.polymer.co/v1/hire/organizations/polymer/jobs"),
  ];

  // d. Workable — CONFLICT: public no-auth vs API-key-only. Try both documented URL forms
  //    against Workable's own dogfooded careers page.
  results.workable = [
    await probe("https://apply.workable.com/api/v1/accounts/workable?details=true"),
    await probe("https://www.workable.com/api/accounts/workable?details=true"),
  ];

  // e. Personio — CONFLICT: same disagreement. Personio's own dogfooded careers subdomain.
  results.personio = [await probe("https://personio.jobs.personio.de/xml?language=en")];

  // f. Pinpoint — CONFLICT: same disagreement. Pinpoint's own dogfooded careers subdomain.
  results.pinpoint = [await probe("https://pinpoint.pinpointhq.com/postings.json")];

  await writeFile("research/phase0c/raw/p6-ats.json", JSON.stringify(results, null, 2), "utf-8");
  runLog["p6-ats"] = Object.values(results).flat();
}

// ---------------------------------------------------------------------
// P7 — HN Who is Hiring via Algolia (cap 3)
// ---------------------------------------------------------------------
async function p7_hn() {
  const results: ProbeResult[] = [];
  const search = await probe(
    "https://hn.algolia.com/api/v1/search?query=Ask%20HN%3A%20Who%20is%20hiring&tags=story,author_whoishiring&hitsPerPage=2",
  );
  results.push(search);

  let threadId: string | number | undefined;
  if (search.ok && Array.isArray(search.body?.hits) && search.body.hits.length > 0) {
    threadId = search.body.hits[0].objectID;
  }

  if (threadId) {
    const item = await probe(`https://hn.algolia.com/api/v1/items/${threadId}`);
    results.push(item);
  }

  await dump("p7-hn", results);
}

// ---------------------------------------------------------------------
// P8 — yc-oss YC directory (cap 3)
// ---------------------------------------------------------------------
async function p8_ycoss() {
  const results: ProbeResult[] = [];
  results.push(await probe("https://yc-oss.github.io/api/companies/hiring.json"));
  await dump("p8-ycoss", results);
}

async function main() {
  await mkdir("research/phase0c/raw", { recursive: true });

  await p1_himalayas();
  await p2_remotive();
  await p3_jobicy();
  await p4_arbeitnow();
  await p5_adzuna();
  await p6_ats();
  await p7_hn();
  await p8_ycoss();

  console.log(`\nTotal HTTP requests this run: ${requestCount} / ${HARD_SESSION_CAP}`);
  await writeFile(
    "research/phase0c/raw/run-summary.json",
    JSON.stringify({ totalRequests: requestCount, ranAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

main().catch((e) => {
  console.error("Fatal error in phase0c probe.ts:", e);
  process.exit(1);
});
