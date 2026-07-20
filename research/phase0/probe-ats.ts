/**
 * Phase 0 / Step 2 — ATS platform detection for target companies.
 * Research-only. No OAOS engine/pipeline/persistence code touched.
 * Re-runnable and idempotent: overwrites ats-findings.md on each run.
 *
 * Rate limit: max 1 request/second (enforced below).
 * Stop probing a company at first confirmed hit (Greenhouse before Lever;
 * Workday only if a myworkdayjobs.com URL was present in the source file).
 * Official APIs only — no brute-forcing Workday tenants, no guessing at
 * unofficial endpoints.
 */

const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries

let lastRequestAt = 0;
let requestCount = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

interface FetchResult {
  ok: boolean;
  status?: number;
  json?: any;
  error?: string;
}

async function fetchJson(url: string): Promise<FetchResult> {
  let lastError = "";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle();
    requestCount++;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OAOS-research-phase0/1.0 (personal, non-commercial probe)" },
      });
      lastStatus = res.status;
      if (res.status === 404) {
        // Not a transient failure — don't retry a confirmed absence.
        return { ok: false, status: 404, error: "404 Not Found" };
      }
      if (res.ok) {
        const json = await res.json();
        return { ok: true, status: res.status, json };
      }
      lastError = `HTTP ${res.status} ${res.statusText}`;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
  }
  return { ok: false, status: lastStatus, error: lastError };
}

interface CompanyEntry {
  name: string;
  url?: string;
  tier: string;
  comment: string;
}

function parseTargetCompanies(text: string): CompanyEntry[] {
  const entries: CompanyEntry[] = [];
  let currentTier = "unspecified";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const tierMatch = line.match(/TIER\s+(\d+)/i);
      if (tierMatch) currentTier = `Tier ${tierMatch[1]}`;
      continue;
    }
    const hashIdx = line.indexOf("#");
    const dataPart = (hashIdx >= 0 ? line.slice(0, hashIdx) : line).trim();
    const comment = (hashIdx >= 0 ? line.slice(hashIdx + 1) : "").trim();
    if (!dataPart) continue;
    const commaIdx = dataPart.indexOf(",");
    if (commaIdx >= 0) {
      entries.push({
        name: dataPart.slice(0, commaIdx).trim(),
        url: dataPart.slice(commaIdx + 1).trim(),
        tier: currentTier,
        comment,
      });
    } else {
      entries.push({ name: dataPart, tier: currentTier, comment });
    }
  }
  return entries;
}

function deriveToken(name: string, url: string | undefined): { token: string; source: string } {
  if (url) {
    const ghMatch = url.match(/(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io)\/([a-zA-Z0-9_-]+)/);
    if (ghMatch) return { token: ghMatch[1], source: "url-pattern (greenhouse)" };
    const leverMatch = url.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/);
    if (leverMatch) return { token: leverMatch[1], source: "url-pattern (lever)" };
    const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/);
    if (ashbyMatch) return { token: ashbyMatch[1], source: "url-pattern (ashby, not probed — out of scope)" };
    const workdayMatch = url.match(/([a-zA-Z0-9-]+)\.wd\d*\.myworkdayjobs\.com\/([a-zA-Z0-9_-]+)/);
    if (workdayMatch) return { token: `${workdayMatch[1]}/${workdayMatch[2]}`, source: "url-pattern (workday)" };
  }
  const stripped = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { token: stripped, source: "lowercase-no-punctuation company name" };
}

function hasRemoteLocation(text: string | undefined | null): boolean {
  return !!text && /remote/i.test(text);
}

interface ProbeOutcome {
  entry: CompanyEntry;
  tokenUsed: string;
  tokenSource: string;
  platform: "greenhouse" | "lever" | "workday" | "none" | "skipped";
  liveCount: number | string;
  remoteCount: number | string;
  note: string;
}

async function probeGreenhouse(token: string): Promise<{ hit: boolean; jobs?: any[] }> {
  const res = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  if (res.ok && Array.isArray(res.json?.jobs)) return { hit: true, jobs: res.json.jobs };
  return { hit: false };
}

async function probeLever(token: string): Promise<{ hit: boolean; postings?: any[] }> {
  const res = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json&limit=100`);
  if (res.ok && Array.isArray(res.json)) return { hit: true, postings: res.json };
  return { hit: false };
}

async function probeCompany(entry: CompanyEntry): Promise<ProbeOutcome> {
  if (!entry.url) {
    return {
      entry,
      tokenUsed: "n/a",
      tokenSource: "n/a — no company-wide careers URL in source file",
      platform: "skipped",
      liveCount: "n/a",
      remoteCount: "n/a",
      note: "not probable via ATS watcher, team-specific (per scope lock: skip entries with no company-wide careers URL)",
    };
  }

  const { token, source } = deriveToken(entry.name, entry.url);

  if (source.startsWith("url-pattern (workday)")) {
    const [tenant, site] = token.split("/");
    const res = await fetchJson(`https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`);
    if (res.ok && Array.isArray(res.json?.jobPostings)) {
      const jobs = res.json.jobPostings;
      const remote = jobs.filter((j: any) => hasRemoteLocation(j.locationsText)).length;
      return {
        entry,
        tokenUsed: token,
        tokenSource: source,
        platform: "workday",
        liveCount: jobs.length,
        remoteCount: remote,
        note: `total from response: ${res.json.total ?? "not measured"}`,
      };
    }
    return {
      entry,
      tokenUsed: token,
      tokenSource: source,
      platform: "none",
      liveCount: 0,
      remoteCount: 0,
      note: "Workday URL present but tenant/site derivation failed to return jobPostings",
    };
  }

  if (source.startsWith("url-pattern (ashby")) {
    return {
      entry,
      tokenUsed: token,
      tokenSource: source,
      platform: "skipped",
      liveCount: "n/a",
      remoteCount: "n/a",
      note: "URL shows Ashby hosting — out of scope for this probe (Greenhouse/Lever/Workday only); not probed",
    };
  }

  const gh = await probeGreenhouse(token);
  if (gh.hit && gh.jobs) {
    const remote = gh.jobs.filter((j: any) => hasRemoteLocation(j.location?.name)).length;
    return {
      entry,
      tokenUsed: token,
      tokenSource: source,
      platform: "greenhouse",
      liveCount: gh.jobs.length,
      remoteCount: remote,
      note: "",
    };
  }

  const lever = await probeLever(token);
  if (lever.hit && lever.postings) {
    const remote = lever.postings.filter((p: any) =>
      hasRemoteLocation(p.categories?.location) || hasRemoteLocation(p.workplaceType),
    ).length;
    const atLimit = lever.postings.length === 100;
    return {
      entry,
      tokenUsed: token,
      tokenSource: source,
      platform: "lever",
      liveCount: atLimit ? "100+ (hit page limit)" : lever.postings.length,
      remoteCount: remote,
      note: atLimit ? "Lever has no total-count field; this is a lower bound (limit=100 page filled)" : "",
    };
  }

  return {
    entry,
    tokenUsed: token,
    tokenSource: source,
    platform: "none",
    liveCount: 0,
    remoteCount: 0,
    note: `no hit on Greenhouse or Lever with token "${token}" — company may use a different ATS (Ashby, in-house, etc.) or a different token`,
  };
}

function watcherViable(outcome: ProbeOutcome): string {
  if (outcome.platform === "skipped") return "team-specific";
  if (outcome.platform === "none") return "no";
  return "yes";
}

async function main() {
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile("research/phase0/target-companies.txt", "utf-8");
  const entries = parseTargetCompanies(raw);

  console.log(`Parsed ${entries.length} companies from target-companies.txt`);

  const outcomes: ProbeOutcome[] = [];
  for (const entry of entries) {
    console.log(`Probing ${entry.name}...`);
    outcomes.push(await probeCompany(entry));
  }

  console.log(`Total HTTP requests made this run: ${requestCount}`);

  const counts = { greenhouse: 0, lever: 0, workday: 0, none: 0, skipped: 0 };
  for (const o of outcomes) counts[o.platform]++;

  const lines: string[] = [];
  lines.push("# ATS platform detection — findings");
  lines.push("");
  lines.push(`**Run at:** ${new Date().toISOString()}`);
  lines.push(`**Total HTTP requests this run:** ${requestCount}`);
  lines.push(`**Companies parsed from target-companies.txt:** ${entries.length}`);
  lines.push("");
  lines.push(
    "| Company | Tier | Careers URL | Platform | Token (source) | Live posting count | Remote-matching (crude text match) | Watcher viable |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const o of outcomes) {
    lines.push(
      `| ${o.entry.name} | ${o.entry.tier} | ${o.entry.url ?? "—"} | ${o.platform} | ${o.tokenUsed} (${o.tokenSource}) | ${o.liveCount} | ${o.remoteCount} | ${watcherViable(o)} |`,
    );
  }
  lines.push("");
  lines.push("Notes:");
  lines.push("- \"Remote-matching\" is a crude case-insensitive `remote` substring match on location text — not the final classifier (same convention as Step 1).");
  lines.push("- Companies with no company-wide careers URL in the source file (Amazon Web Services, IBM) were not probed at all — team-specific hiring, not reachable via a company-board watcher by design.");
  lines.push("- A `none` result means no hit on Greenhouse or Lever with the derived token — it does NOT rule out the company being on one of those platforms under a different token; it means this single-token-per-company probe (per Step 2 scope) didn't find it.");
  for (const o of outcomes) {
    if (o.note) lines.push(`- **${o.entry.name}:** ${o.note}`);
  }
  lines.push("");
  lines.push("## Platform counts");
  lines.push("");
  lines.push(`- Greenhouse: ${counts.greenhouse}`);
  lines.push(`- Lever: ${counts.lever}`);
  lines.push(`- Workday: ${counts.workday}`);
  lines.push(`- No hit (none): ${counts.none}`);
  lines.push(`- Skipped (team-specific / out-of-scope platform): ${counts.skipped}`);
  lines.push("");
  lines.push("## Recommendation — ready for Phase 1 Greenhouse/Lever watcher build now");
  lines.push("");
  const ready = outcomes.filter((o) => o.platform === "greenhouse" || o.platform === "lever");
  if (ready.length === 0) {
    lines.push("None confirmed this run.");
  } else {
    for (const o of ready) {
      lines.push(`- **${o.entry.name}** (${o.entry.tier}) — ${o.platform}, token \`${o.tokenUsed}\`, ${o.liveCount} live postings.`);
    }
  }
  lines.push("");

  await fs.writeFile("research/phase0/ats-findings.md", lines.join("\n"), "utf-8");
  console.log("Wrote research/phase0/ats-findings.md");
}

main().catch((e) => {
  console.error("Fatal error in probe-ats.ts:", e);
  process.exit(1);
});
