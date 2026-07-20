/**
 * Phase 0 / Step 2b — targeted re-probe (final Phase 0 step).
 * Research-only. No OAOS engine/pipeline/persistence code touched.
 *
 * Fresh budget: hard cap 40 requests, 1 req/sec. Enforced with a hard
 * stop in fetchJson — once requestCount hits MAX_TOTAL_REQUESTS, no
 * further network calls are made regardless of what's left unchecked;
 * remaining items are recorded as "not measured — budget exhausted".
 *
 * Idempotent: appends a "## Step 2b" section to ats-findings.md, first
 * stripping any previous Step 2b section so re-runs don't duplicate.
 */

const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries, only on transient failure (not 404)
const MAX_TOTAL_REQUESTS = 40;

let lastRequestAt = 0;
let requestCount = 0;
let budgetExhausted = false;

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

async function fetchJson(url: string, init?: RequestInit): Promise<FetchResult> {
  if (requestCount >= MAX_TOTAL_REQUESTS) {
    budgetExhausted = true;
    return { ok: false, error: "not measured — budget exhausted (40-request hard cap reached)" };
  }
  let lastError = "";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (requestCount >= MAX_TOTAL_REQUESTS) {
      budgetExhausted = true;
      return { ok: false, error: "not measured — budget exhausted (40-request hard cap reached)" };
    }
    await throttle();
    requestCount++;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OAOS-research-phase0/1.0 (personal, non-commercial probe)", ...(init?.headers ?? {}) },
        ...init,
      });
      lastStatus = res.status;
      if (res.status === 404) {
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

function hasRemoteLocation(text: string | undefined | null): boolean {
  return !!text && /remote/i.test(text);
}

// ---------- Task 1: Ashby checks ----------

interface AshbyOutcome {
  companyLabel: string;
  triedNames: string[];
  hitName?: string;
  liveCount: number | string;
  remoteCount: number | string;
  note: string;
}

async function probeAshby(companyLabel: string, names: string[]): Promise<AshbyOutcome> {
  for (const name of names) {
    const res = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${name}`);
    if (res.ok && Array.isArray(res.json?.jobs)) {
      const jobs = res.json.jobs;
      const remote = jobs.filter(
        (j: any) => j.isRemote === true || hasRemoteLocation(j.location) || hasRemoteLocation(j.locationName),
      ).length;
      return {
        companyLabel,
        triedNames: names,
        hitName: name,
        liveCount: jobs.length,
        remoteCount: remote,
        note: "",
      };
    }
    if (res.error?.startsWith("not measured")) {
      return {
        companyLabel,
        triedNames: names,
        liveCount: "not measured",
        remoteCount: "not measured",
        note: res.error,
      };
    }
  }
  return {
    companyLabel,
    triedNames: names,
    liveCount: 0,
    remoteCount: 0,
    note: `no hit on Ashby for any of: ${names.join(", ")}`,
  };
}

// ---------- Task 2: GH/Lever token-variant retry ----------

interface VariantRetryOutcome {
  companyLabel: string;
  triedVariants: string[];
  platform: "greenhouse" | "lever" | "none" | "budget-exhausted";
  hitToken?: string;
  liveCount: number | string;
  remoteCount: number | string;
  note: string;
}

async function probeGreenhouseVariant(token: string): Promise<{ hit: boolean; jobs?: any[]; exhausted?: boolean }> {
  const res = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  if (res.ok && Array.isArray(res.json?.jobs)) return { hit: true, jobs: res.json.jobs };
  if (res.error?.startsWith("not measured")) return { hit: false, exhausted: true };
  return { hit: false };
}

async function probeLeverVariant(token: string): Promise<{ hit: boolean; postings?: any[]; exhausted?: boolean }> {
  const res = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json&limit=100`);
  if (res.ok && Array.isArray(res.json)) return { hit: true, postings: res.json };
  if (res.error?.startsWith("not measured")) return { hit: false, exhausted: true };
  return { hit: false };
}

async function retryVariants(companyLabel: string, variants: string[]): Promise<VariantRetryOutcome> {
  for (const token of variants) {
    const gh = await probeGreenhouseVariant(token);
    if (gh.exhausted) {
      return {
        companyLabel,
        triedVariants: variants,
        platform: "budget-exhausted",
        liveCount: "not measured",
        remoteCount: "not measured",
        note: "budget exhausted before this company's variants were fully tried",
      };
    }
    if (gh.hit && gh.jobs) {
      const remote = gh.jobs.filter((j: any) => hasRemoteLocation(j.location?.name)).length;
      return {
        companyLabel,
        triedVariants: variants,
        platform: "greenhouse",
        hitToken: token,
        liveCount: gh.jobs.length,
        remoteCount: remote,
        note: "",
      };
    }
    const lever = await probeLeverVariant(token);
    if (lever.exhausted) {
      return {
        companyLabel,
        triedVariants: variants,
        platform: "budget-exhausted",
        liveCount: "not measured",
        remoteCount: "not measured",
        note: "budget exhausted before this company's variants were fully tried",
      };
    }
    if (lever.hit && lever.postings) {
      const remote = lever.postings.filter(
        (p: any) => hasRemoteLocation(p.categories?.location) || hasRemoteLocation(p.workplaceType),
      ).length;
      const atLimit = lever.postings.length === 100;
      return {
        companyLabel,
        triedVariants: variants,
        platform: "lever",
        hitToken: token,
        liveCount: atLimit ? "100+ (hit page limit)" : lever.postings.length,
        remoteCount: remote,
        note: atLimit ? "Lever has no total-count field; lower bound" : "",
      };
    }
  }
  return {
    companyLabel,
    triedVariants: variants,
    platform: "none",
    liveCount: 0,
    remoteCount: 0,
    note: `no hit on Greenhouse or Lever for any of: ${variants.join(", ")}`,
  };
}

// ---------- Task 3: Red Hat Workday ----------

interface WorkdayOutcome {
  totalAll: number | string;
  totalRemoteIndia: number | string;
  note: string;
}

async function probeRedHatWorkday(): Promise<WorkdayOutcome> {
  const url = "https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/Jobs/jobs";
  const bodyAll = JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" });
  const resAll = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyAll,
  });
  if (!resAll.ok) {
    return { totalAll: "not measured", totalRemoteIndia: "not measured", note: `all-jobs query failed: ${resAll.error}` };
  }
  const totalAll = typeof resAll.json?.total === "number" ? resAll.json.total : "not measured (no total field)";

  const bodyRemoteIndia = JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "remote india" });
  const resRemoteIndia = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyRemoteIndia,
  });
  if (!resRemoteIndia.ok) {
    return { totalAll, totalRemoteIndia: "not measured", note: `remote-india query failed: ${resRemoteIndia.error}` };
  }
  const totalRemoteIndia =
    typeof resRemoteIndia.json?.total === "number" ? resRemoteIndia.json.total : "not measured (no total field)";

  return { totalAll, totalRemoteIndia, note: "" };
}

// ---------- Task 4: Teleport sanity ----------

interface TeleportSanity {
  leverCount: number | string;
  ashbyLiveCount: number | string;
  verdict: string;
}

async function probeTeleportSanity(ashbyOutcome: AshbyOutcome | undefined): Promise<TeleportSanity> {
  const res = await fetchJson("https://api.lever.co/v0/postings/teleport?mode=json&limit=100");
  let leverCount: number | string = "not measured";
  if (res.ok && Array.isArray(res.json)) {
    leverCount = res.json.length;
  } else if (res.error?.startsWith("not measured")) {
    leverCount = res.error;
  } else {
    leverCount = 0;
  }

  const ashbyLive = ashbyOutcome?.liveCount ?? "not checked";
  let verdict: string;
  if (typeof leverCount === "number" && leverCount === 0 && typeof ashbyLive === "number" && ashbyLive > 0) {
    verdict = "Lever token is stale/empty — Ashby has live postings. Use Ashby, not Lever, for Teleport.";
  } else if (typeof leverCount === "number" && leverCount > 0) {
    verdict = "Lever board has live postings — original Step 2 result confirmed usable.";
  } else if (typeof ashbyLive === "number" && ashbyLive === 0) {
    verdict = "Neither Lever nor Ashby show live postings for Teleport right now — both checked, both empty.";
  } else {
    verdict = "Inconclusive — see raw counts.";
  }

  return { leverCount, ashbyLiveCount: ashbyLive, verdict };
}

async function main() {
  const fs = await import("node:fs/promises");

  console.log("Task 3: Red Hat Workday (highest signal, cheapest — run first)...");
  const redHat = await probeRedHatWorkday();

  console.log("Task 1: Ashby checks...");
  const ashbyOutcomes: AshbyOutcome[] = [];
  ashbyOutcomes.push(await probeAshby("SigNoz", ["signoz"]));
  ashbyOutcomes.push(await probeAshby("Chainguard", ["chainguard"]));
  ashbyOutcomes.push(await probeAshby("Loft Labs", ["loftlabs", "loft-labs", "loft"]));
  ashbyOutcomes.push(await probeAshby("Swirlds Labs", ["swirldslabs", "swirlds-labs", "hashgraph"]));
  const teleportAshby = await probeAshby("Teleport", ["teleport"]);
  ashbyOutcomes.push(teleportAshby);

  console.log("Task 4: Teleport Lever sanity check...");
  const teleportSanity = await probeTeleportSanity(teleportAshby);

  console.log("Task 2: Token-variant retry on Greenhouse/Lever (India-relevant misses)...");
  const variantOutcomes: VariantRetryOutcome[] = [];
  variantOutcomes.push(await retryVariants("AccuKnox", ["accuknox"]));
  variantOutcomes.push(await retryVariants("Last9", ["last9", "last9io"]));
  variantOutcomes.push(await retryVariants("Civo", ["civo", "civocloud"]));
  variantOutcomes.push(await retryVariants("One2N", ["one2n", "one2ninc"]));
  variantOutcomes.push(await retryVariants("Appsmith", ["appsmith", "appsmithinc"]));
  variantOutcomes.push(await retryVariants("Solo.io", ["soloio", "solo"]));
  variantOutcomes.push(await retryVariants("LocalStack", ["localstack", "localstackcloud"]));

  console.log(`Total HTTP requests made this run: ${requestCount}${budgetExhausted ? " (HIT 40-REQUEST CAP)" : ""}`);

  // ---- Build the Step 2b markdown section ----
  const lines: string[] = [];
  lines.push("## Step 2b — targeted re-probe (final Phase 0 step)");
  lines.push("");
  lines.push(`**Run at:** ${new Date().toISOString()}`);
  lines.push(`**Total HTTP requests this run:** ${requestCount} / 40 cap${budgetExhausted ? " — **CAP REACHED, some items not measured**" : ""}`);
  lines.push("");

  lines.push("### Task 3 — Red Hat Workday (`redhat.wd5.myworkdayjobs.com`, tenant `redhat`, site `Jobs`)");
  lines.push("");
  lines.push(`- Total live postings (empty searchText): ${redHat.totalAll}`);
  lines.push(`- Total matching searchText \`"remote india"\`: ${redHat.totalRemoteIndia}`);
  if (redHat.note) lines.push(`- Note: ${redHat.note}`);
  lines.push("");

  lines.push("### Task 1 — Ashby checks");
  lines.push("");
  lines.push("| Company | Names tried | Hit | Live postings | Remote-matching |");
  lines.push("|---|---|---|---|---|");
  for (const o of ashbyOutcomes) {
    lines.push(
      `| ${o.companyLabel} | ${o.triedNames.join(", ")} | ${o.hitName ?? "none"} | ${o.liveCount} | ${o.remoteCount} |`,
    );
  }
  lines.push("");
  for (const o of ashbyOutcomes) {
    if (o.note) lines.push(`- **${o.companyLabel}:** ${o.note}`);
  }
  lines.push("");

  lines.push("### Task 4 — Teleport sanity check");
  lines.push("");
  lines.push(`- Lever (\`teleport\`, full page): ${teleportSanity.leverCount} live postings`);
  lines.push(`- Ashby (\`teleport\`): ${teleportSanity.ashbyLiveCount} live postings`);
  lines.push(`- **Verdict: ${teleportSanity.verdict}**`);
  lines.push("");

  lines.push("### Task 2 — Token-variant retry (Greenhouse + Lever), India-relevant misses");
  lines.push("");
  lines.push("| Company | Variants tried | Platform | Hit token | Live postings | Remote-matching |");
  lines.push("|---|---|---|---|---|---|");
  for (const o of variantOutcomes) {
    lines.push(
      `| ${o.companyLabel} | ${o.triedVariants.join(", ")} | ${o.platform} | ${o.hitToken ?? "—"} | ${o.liveCount} | ${o.remoteCount} |`,
    );
  }
  lines.push("");
  for (const o of variantOutcomes) {
    if (o.note) lines.push(`- **${o.companyLabel}:** ${o.note}`);
  }
  lines.push("");

  const section = lines.join("\n");

  // ---- Idempotent append to ats-findings.md ----
  const existing = await fs.readFile("research/phase0/ats-findings.md", "utf-8");
  const marker = "\n## Step 2b — targeted re-probe (final Phase 0 step)";
  const cutIdx = existing.indexOf(marker);
  const base = cutIdx >= 0 ? existing.slice(0, cutIdx) : existing;
  const updated = base.replace(/\n+$/, "\n") + "\n" + section + "\n";
  await fs.writeFile("research/phase0/ats-findings.md", updated, "utf-8");

  // Also drop the raw structured results as JSON for traceability / for SUMMARY.md authoring.
  await fs.writeFile(
    "research/phase0/step2b-raw-results.json",
    JSON.stringify({ redHat, ashbyOutcomes, teleportSanity, variantOutcomes, requestCount, budgetExhausted }, null, 2),
    "utf-8",
  );

  console.log("Appended Step 2b section to ats-findings.md; wrote step2b-raw-results.json");
}

main().catch((e) => {
  console.error("Fatal error in probe-2b.ts:", e);
  process.exit(1);
});
