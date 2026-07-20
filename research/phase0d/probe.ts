/**
 * Phase 0d — OSS paid-work source verification (final research probe session).
 * Research-only. No OAOS engine/pipeline/persistence code touched.
 *
 * Rate limit: max 1 request/second globally (enforced below).
 * Hard session cap: 25 requests total (enforced — throws if exceeded).
 *
 * Writes one raw JSON dump per probe to research/phase0d/raw/, and a
 * single run-summary.json index. findings.md and FINAL-OSS-SOURCES.md
 * are hand-composed afterward from these raw dumps (same convention as
 * Phase 0 / Phase 0c).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";

const MIN_INTERVAL_MS = 1000;
const HARD_SESSION_CAP = 25;

let lastRequestAt = 0;
let requestCount = 0;

let githubToken: string | undefined;

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

async function probe(
  url: string,
  opts?: { label?: string; useGithubAuth?: boolean; accept?: string },
): Promise<ProbeResult> {
  requestCount++;
  if (requestCount > HARD_SESSION_CAP) {
    throw new Error(
      `HARD SESSION CAP EXCEEDED (${HARD_SESSION_CAP}) — refusing request #${requestCount} to ${url}`,
    );
  }
  await throttle();
  console.log(`[${requestCount}/${HARD_SESSION_CAP}] GET ${url}`);
  try {
    const headers: Record<string, string> = {
      "User-Agent": "OAOS-research-phase0d/1.0 (personal, non-commercial probe)",
    };
    if (opts?.accept) headers["Accept"] = opts.accept;
    if (opts?.useGithubAuth && githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

    const res = await fetch(url, { headers });
    const headersOfInterest: Record<string, string> = {};
    for (const h of [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-rate-limit-limit",
      "x-rate-limit-remaining",
      "retry-after",
      "content-type",
      "last-modified",
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

async function dump(probeName: string, results: unknown) {
  await writeFile(
    `research/phase0d/raw/${probeName}.json`,
    JSON.stringify(results, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------
// P1 — LFX multi-foundation intake surfaces (cap 6, uses 4)
// ---------------------------------------------------------------------
async function p1_lfx() {
  const results: Record<string, ProbeResult> = {};
  results.cncf_mentoring = await probe(
    "https://api.github.com/repos/cncf/mentoring/contents/programs/lfx-mentorship",
    { useGithubAuth: true },
  );
  results.lfdt_mentorship = await probe(
    "https://api.github.com/repos/lf-decentralized-trust-mentorships/mentorship-program",
    { useGithubAuth: true },
  );
  results.ebpf_foundation_page = await probe("https://ebpf.foundation/mentorship-program/");
  results.lfx_portal_page = await probe("https://mentorship.lfx.linuxfoundation.org/");
  await dump("p1-lfx", results);
}

// ---------------------------------------------------------------------
// P2 — GSoC org data conflict resolution (cap 3, uses 2)
// ---------------------------------------------------------------------
async function p2_gsoc() {
  const results: Record<string, ProbeResult> = {};
  results.gsocorganizations_dev = await probe("https://api.gsocorganizations.dev/");
  results.summerofcode_2026_orgs_page = await probe(
    "https://summerofcode.withgoogle.com/programs/2026/organizations",
  );
  await dump("p2-gsoc", results);
}

// ---------------------------------------------------------------------
// P3 — Algora via GitHub search API (cap 3, uses 1)
// ---------------------------------------------------------------------
async function p3_algora() {
  const results: Record<string, ProbeResult> = {};
  results.search_bounty_comments = await probe(
    `https://api.github.com/search/issues?q=${encodeURIComponent('"/bounty" in:comments state:open')}&per_page=5`,
    { useGithubAuth: true },
  );
  await dump("p3-algora", results);
}

// ---------------------------------------------------------------------
// P4 — Polar API (cap 2)
// ---------------------------------------------------------------------
async function p4_polar() {
  const results: Record<string, ProbeResult> = {};
  results.docs_page = await probe("https://polar.sh/docs");
  results.issues_endpoint = await probe(
    "https://api.polar.sh/v1/issues/?limit=5",
  );
  await dump("p4-polar", results);
}

// ---------------------------------------------------------------------
// P5 — NLnet RSS (cap 2)
// ---------------------------------------------------------------------
async function p5_nlnet() {
  const results: Record<string, ProbeResult> = {};
  results.homepage = await probe("https://nlnet.nl/");
  results.news_feed = await probe("https://nlnet.nl/news/news.xml");
  await dump("p5-nlnet", results);
}

// ---------------------------------------------------------------------
// P6 — ESoC repo (cap 2, uses 1)
// ---------------------------------------------------------------------
async function p6_esoc() {
  const results: Record<string, ProbeResult> = {};
  results.esoc2026_repo = await probe(
    "https://api.github.com/repos/european-summer-of-code/esoc2026",
    { useGithubAuth: true },
  );
  await dump("p6-esoc", results);
}

// ---------------------------------------------------------------------
// P7 — Outreachy RSS (cap 2)
// ---------------------------------------------------------------------
async function p7_outreachy() {
  const results: Record<string, ProbeResult> = {};
  results.blog_page = await probe("https://www.outreachy.org/blog/");
  results.feed = await probe("https://www.outreachy.org/blog/feed/");
  await dump("p7-outreachy", results);
}

// ---------------------------------------------------------------------
// P8 — GitHub Security Lab bounties (cap 2, uses 1)
// ---------------------------------------------------------------------
async function p8_ghsl() {
  const results: Record<string, ProbeResult> = {};
  results.bounties_page = await probe("https://securitylab.github.com/bounties");
  await dump("p8-ghsl", results);
}

async function main() {
  await mkdir("research/phase0d/raw", { recursive: true });

  try {
    const envRaw = await readFile(".env", "utf-8");
    const m = envRaw.match(/GITHUB_TOKEN\s*=\s*(\S+)/);
    if (m) githubToken = m[1];
  } catch {
    // absent — proceed unauthenticated
  }

  await p1_lfx();
  await p2_gsoc();
  await p3_algora();
  await p4_polar();
  await p5_nlnet();
  await p6_esoc();
  await p7_outreachy();
  await p8_ghsl();

  console.log(`\nTotal HTTP requests this run: ${requestCount} / ${HARD_SESSION_CAP}`);
  await writeFile(
    "research/phase0d/raw/run-summary.json",
    JSON.stringify({ totalRequests: requestCount, ranAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

main().catch((e) => {
  console.error("Fatal error in phase0d probe.ts:", e);
  process.exit(1);
});
