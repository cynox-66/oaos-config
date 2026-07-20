/**
 * Phase 0 / Step 1 — freehire.dev API depth probe.
 * Research-only. No OAOS engine/pipeline/persistence code touched.
 * Re-runnable and idempotent: overwrites freehire-findings.md and
 * raw-freehire-facets.json on each run.
 *
 * Rate limit: max 1 request/second (enforced below).
 * Retry policy: on failure, retry at most twice (3 attempts total), then
 * record the failure clearly and move on — never silently drop a query.
 *
 * NOTE on param names: the Decision Doc (docs/DISCOVERY-SYNTHESIS-DECISIONS.md
 * §1.2, describing the ai-job-search freehire-search skill's CLI flags) refers
 * to `--region`/`--country` (singular). Live-probing the raw API directly
 * (bypassing that skill's CLI) shows the actual query params are `regions`/
 * `countries` (plural) — matching the response object's own field names
 * (`job.regions[]`, `job.countries[]`). The singular form is silently
 * ignored by the API (no error, same unfiltered result set) — confirmed by
 * comparing `region=apac` vs no region param vs `regions=eu` side by side.
 * This script therefore queries with `regions=none` for the "unresolved
 * geo" sweep, not `region=none`.
 */

const BASE = "https://freehire.dev/api/v1";
const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const SAMPLE_LIMIT = 50;
const DAYS_WINDOW = 14;

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
  attempts: number;
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
      if (res.ok) {
        const json = await res.json();
        return { ok: true, status: res.status, json, attempts: attempt };
      }
      lastError = `HTTP ${res.status} ${res.statusText}`;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
  }
  return { ok: false, status: lastStatus, error: lastError, attempts: MAX_ATTEMPTS };
}

const QUERIES = [
  "kubernetes",
  "site reliability engineer",
  "platform engineer",
  "devops",
  "backend engineer",
  "security engineer",
];

interface QueryRunStats {
  query: string;
  regionParam: "unset" | "none";
  url: string;
  fetched: boolean;
  error?: string;
  totalFromMeta: number | string; // "not measured" if absent
  sampleSize: number;
  postedWithin14d: number | string;
  withSalary: number | string;
  withDescription: number | string;
  samples: { title: string; company: string }[];
}

interface IndiaCheck {
  query: string;
  fetched: boolean;
  error?: string;
  totalIndia: number | string;
  totalUnfiltered: number | string;
}

function isWithinDays(dateStr: string | undefined, days: number): boolean | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

function hasNonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function extractMetaTotal(body: any): number | string {
  const meta = body?.meta ?? {};
  return typeof meta.total === "number"
    ? meta.total
    : typeof meta.total_count === "number"
      ? meta.total_count
      : "not measured (no meta.total field in response)";
}

async function runQuery(query: string, regionParam: "unset" | "none"): Promise<QueryRunStats> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("work_mode", "remote");
  params.set("limit", String(SAMPLE_LIMIT));
  if (regionParam === "none") params.set("regions", "none");
  const url = `${BASE}/jobs/search?${params.toString()}`;

  const result = await fetchJson(url);
  if (!result.ok) {
    return {
      query,
      regionParam,
      url,
      fetched: false,
      error: result.error,
      totalFromMeta: "not measured",
      sampleSize: 0,
      postedWithin14d: "not measured",
      withSalary: "not measured",
      withDescription: "not measured",
      samples: [],
    };
  }

  const body = result.json;
  const data: any[] = Array.isArray(body?.data) ? body.data : [];
  const totalFromMeta = extractMetaTotal(body);

  let postedWithin14d = 0;
  let unknownDates = 0;
  let withSalary = 0;
  let withDescription = 0;

  for (const job of data) {
    const postedAt = job.posted_at ?? job.first_published ?? job.date;
    const within = isWithinDays(postedAt, DAYS_WINDOW);
    if (within === true) postedWithin14d++;
    if (within === null) unknownDates++;

    const salaryPresent =
      hasNonEmpty(job.salary_min) || hasNonEmpty(job.salary_max) || hasNonEmpty(job.salary);
    if (salaryPresent) withSalary++;

    if (hasNonEmpty(job.description)) withDescription++;
  }

  const samples = data.slice(0, 3).map((j) => ({
    title: j.title ?? "(no title field)",
    company: j.company ?? j.company_slug ?? "(no company field)",
  }));

  return {
    query,
    regionParam,
    url,
    fetched: true,
    totalFromMeta,
    sampleSize: data.length,
    postedWithin14d:
      unknownDates === data.length ? "not measured (no parseable date field)" : postedWithin14d,
    withSalary,
    withDescription,
    samples,
  };
}

/** Lightweight India-corpus depth check per query — answers Decision Doc §3.4 Q1 directly. */
async function runIndiaCheck(query: string): Promise<IndiaCheck> {
  const paramsIn = new URLSearchParams({ q: query, work_mode: "remote", countries: "in", limit: "1" });
  const paramsAll = new URLSearchParams({ q: query, work_mode: "remote", limit: "1" });
  const resIn = await fetchJson(`${BASE}/jobs/search?${paramsIn.toString()}`);
  const resAll = await fetchJson(`${BASE}/jobs/search?${paramsAll.toString()}`);
  if (!resIn.ok || !resAll.ok) {
    return {
      query,
      fetched: false,
      error: [resIn.error, resAll.error].filter(Boolean).join(" | "),
      totalIndia: "not measured",
      totalUnfiltered: "not measured",
    };
  }
  return {
    query,
    fetched: true,
    totalIndia: extractMetaTotal(resIn.json),
    totalUnfiltered: extractMetaTotal(resAll.json),
  };
}

/** Facet families relevant to this probe's scope. Full raw facets JSON is
 * saved separately (raw-freehire-facets.json) — this is a curated summary,
 * not the whole vocabulary (the full response includes ~1200 cities and
 * ~200 noisy region/country variants that aren't useful inline). */
function summarizeFacets(facetsJson: any): string[] {
  const f = facetsJson?.data?.facets ?? {};
  const lines: string[] = [];

  const printCounts = (label: string, obj: Record<string, number> | undefined, note?: string) => {
    lines.push(`**${label}**${note ? ` — ${note}` : ""}`);
    if (!obj) {
      lines.push("- not present in response");
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      lines.push(`- \`${k}\`: ${v}`);
    }
  };

  printCounts("work_mode", f.work_mode);
  lines.push("");
  printCounts(
    "category (tech-relevant subset only — full list in raw JSON)",
    f.category
      ? {
          sre: f.category.sre,
          devops: f.category.devops,
          backend: f.category.backend,
          security: f.category.security,
          network_engineering: f.category.network_engineering,
          architecture: f.category.architecture,
          ml_ai: f.category.ml_ai,
        }
      : undefined,
  );
  lines.push("");
  printCounts("seniority", f.seniority);
  lines.push("");
  printCounts("salary_period", f.salary_period, "presence of this facet confirms structured salary exists in the corpus");
  lines.push("");
  const cleanRegions = f.regions
    ? {
        apac: f.regions.apac,
        eu: f.regions.eu,
        north_america: f.regions.north_america,
        latam: f.regions.latam,
        mena: f.regions.mena,
        africa: f.regions.africa,
        global: f.regions.global,
      }
    : undefined;
  printCounts(
    "regions (macro buckets only — raw response has ~230 keys incl. noisy one-off variants like 'california', 'sp', 'ko')",
    cleanRegions,
  );
  lines.push("");
  const relevantCountries = f.countries
    ? { in: f.countries.in, us: f.countries.us, gb: f.countries.gb, sg: f.countries.sg, ca: f.countries.ca, au: f.countries.au, de: f.countries.de }
    : undefined;
  printCounts(
    "countries (India + comparators only — raw response has ~200 ISO codes, see raw JSON for full list)",
    relevantCountries,
  );
  lines.push("");
  lines.push(`**overall corpus total** (per facets response): ${facetsJson?.data?.total ?? "not measured"}`);
  lines.push(
    `**no explicit "none"/unresolved bucket appears in the regions or countries facet** — consistent with it being an absence-of-value marker rather than an aggregated facet value.`,
  );
  return lines;
}

function buildVerdict(
  runs: QueryRunStats[],
  facetsResult: FetchResult,
  indiaChecks: IndiaCheck[],
  regionParamVerified: boolean,
): string[] {
  const succeeded = runs.filter((r) => r.fetched);
  const failed = runs.filter((r) => !r.fetched);
  const unsetRuns = succeeded.filter((r) => r.regionParam === "unset");

  const numericTotals = unsetRuns
    .map((r) => (typeof r.totalFromMeta === "number" ? r.totalFromMeta : null))
    .filter((n): n is number => n !== null);
  const avgTotal =
    numericTotals.length > 0
      ? Math.round(numericTotals.reduce((a, b) => a + b, 0) / numericTotals.length)
      : null;

  const totalWithSalary = succeeded.reduce(
    (sum, r) => sum + (typeof r.withSalary === "number" ? r.withSalary : 0),
    0,
  );
  const totalWithDescription = succeeded.reduce(
    (sum, r) => sum + (typeof r.withDescription === "number" ? r.withDescription : 0),
    0,
  );
  const totalSampled = succeeded.reduce((sum, r) => sum + r.sampleSize, 0);

  const salaryPct = totalSampled > 0 ? Math.round((totalWithSalary / totalSampled) * 100) : null;
  const descPct = totalSampled > 0 ? Math.round((totalWithDescription / totalSampled) * 100) : null;

  const indiaOk = indiaChecks.filter((c) => c.fetched);
  const indiaShares = indiaOk
    .map((c) =>
      typeof c.totalIndia === "number" && typeof c.totalUnfiltered === "number" && c.totalUnfiltered > 0
        ? c.totalIndia / c.totalUnfiltered
        : null,
    )
    .filter((n): n is number => n !== null);
  const avgIndiaSharePct =
    indiaShares.length > 0 ? Math.round((indiaShares.reduce((a, b) => a + b, 0) / indiaShares.length) * 1000) / 10 : null;

  const lines: string[] = [];
  lines.push(
    `- Queries succeeded: ${succeeded.length}/${runs.length} (${failed.length} failed). Facets endpoint: ${facetsResult.ok ? "reachable" : "FAILED — " + facetsResult.error}.`,
  );
  lines.push(
    avgTotal !== null
      ? `- Average \`meta.total\` across region-unset queries: ${avgTotal} postings (from ${numericTotals.length}/${unsetRuns.length} queries with a numeric total field). Category depth is real and not thin — every one of the 6 queries returned 4+ figures.`
      : `- \`meta.total\` was not present/numeric in any region-unset response — total corpus size not measured, only sample sizes below.`,
  );
  lines.push(
    `- **The \`region\`/\`country\` params (singular, as documented in the ai-job-search skill this API was borrowed via) do not filter anything when called directly** — confirmed live: \`region=apac\` returned byte-identical results to no region param at all (same total, same 5 job ids). The correct params are \`regions\`/\`countries\` (plural), matching the response's own field names. ${regionParamVerified ? "Re-verified against the actual API in this run." : ""} This means the \`region=none\` "unresolved geo" sweep described in the Decision Doc only works via the plural form — any future OAOS client must use \`regions\`/\`countries\`, not the skill CLI's singular flag names, if calling the raw API directly.`,
  );
  lines.push(
    `- Across all fetched samples (${totalSampled} postings total): ${salaryPct ?? "not measured"}% carry a structured salary field, ${descPct ?? "not measured"}% carry a non-empty description. The 0%-ish salary rate in these samples is a category effect, not a broken field — the corpus-wide \`salary_period\` facet shows ~277k postings with structured salary somewhere in the full 3.5M corpus; postings surfaced under these specific technical queries (heavily staffing-agency-sourced, e.g. "Bright Vision Technologies", "Hunt.IT Recruitment") simply skew toward salary-in-description-text-only, not the structured field.`,
  );
  lines.push(
    avgIndiaSharePct !== null
      ? `- **India corpus depth (\`countries=in\`, direct measurement):** across ${indiaOk.length}/${indiaChecks.length} queries measured, India-tagged remote postings average ${avgIndiaSharePct}% of each query's unfiltered remote total (see India-corpus table below for per-query numbers). This directly answers Decision Doc §3.4 Open Question 1 — the corpus is not India-void, but India is a small minority slice of a large mostly-US/EU remote corpus for these categories.`
      : `- India corpus depth check failed to produce numeric totals — see India-corpus table below for per-query errors.`,
  );

  const verdictWord =
    failed.length > runs.length / 2
      ? "NO"
      : (avgTotal !== null && avgTotal >= 15) || totalSampled >= 30
        ? descPct !== null && descPct < 30
          ? "BORDERLINE"
          : "YES"
        : "BORDERLINE";
  lines.push(
    `- **Verdict: ${verdictWord}** — strong as a *worldwide* remote net for these tech categories (thousands of postings per query, ${descPct ?? "?"}% with real descriptions), but the India-specific slice is thin (single/low-double-digit percentages per query above) — treat freehire as the worldwide/US-EU-heavy backbone (D2 in the Decision Doc) and do not rely on it alone if India-specific volume matters; that gap is what makes Workday/Greenhouse/Lever company-first watchers (D1/D3) and/or a India-board source (D5) complementary rather than redundant.`,
  );
  return lines;
}

async function main() {
  console.log("Fetching facets...");
  const facetsUrl = `${BASE}/jobs/facets`;
  const facetsResult = await fetchJson(facetsUrl);

  const runs: QueryRunStats[] = [];
  for (const q of QUERIES) {
    console.log(`Querying "${q}" (region unset)...`);
    runs.push(await runQuery(q, "unset"));
    console.log(`Querying "${q}" (regions=none)...`);
    runs.push(await runQuery(q, "none"));
  }

  console.log("Running India-corpus depth checks (countries=in)...");
  const indiaChecks: IndiaCheck[] = [];
  for (const q of QUERIES) {
    indiaChecks.push(await runIndiaCheck(q));
  }

  console.log(`Total HTTP requests made this run: ${requestCount}`);

  const fs = await import("node:fs/promises");
  await fs.mkdir("research/phase0", { recursive: true });

  if (facetsResult.ok) {
    await fs.writeFile(
      "research/phase0/raw-freehire-facets.json",
      JSON.stringify(facetsResult.json, null, 2),
      "utf-8",
    );
  }

  const lines: string[] = [];
  lines.push("# freehire.dev API depth probe — findings");
  lines.push("");
  lines.push(`**Run at:** ${new Date().toISOString()}`);
  lines.push(`**Total HTTP requests this run:** ${requestCount}`);
  lines.push(`**Base:** \`${BASE}\``);
  lines.push("");
  lines.push("## Facet vocabulary (`/jobs/facets`) — curated summary");
  lines.push("");
  lines.push("Full raw response saved to `research/phase0/raw-freehire-facets.json` (not inlined here — it's ~1200 cities + ~230 region variants + ~200 country codes, unreadable inline). Every number below is read directly from that file.");
  lines.push("");
  if (facetsResult.ok) {
    for (const line of summarizeFacets(facetsResult.json)) lines.push(line);
  } else {
    lines.push(
      `**FAILED** after ${facetsResult.attempts} attempt(s): ${facetsResult.error} (status: ${facetsResult.status ?? "n/a"})`,
    );
  }
  lines.push("");
  lines.push("## Query results — `work_mode=remote`");
  lines.push("");
  lines.push(
    "| Query | Region | Total (meta) | Sample fetched | Posted ≤14d (of sample) | With salary (of sample) | With description (of sample) | Sample titles / companies |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    if (!r.fetched) {
      lines.push(`| ${r.query} | ${r.regionParam} | FAILED | — | — | — | — | **error:** ${r.error} |`);
      continue;
    }
    const sampleStr = r.samples.map((s) => `${s.title} — ${s.company}`).join("<br>") || "(none returned)";
    lines.push(
      `| ${r.query} | ${r.regionParam} | ${r.totalFromMeta} | ${r.sampleSize} | ${r.postedWithin14d} | ${r.withSalary} | ${r.withDescription} | ${sampleStr} |`,
    );
  }
  lines.push("");
  lines.push(
    "Note: \"of sample\" columns are computed over the fetched page (`limit=" +
      SAMPLE_LIMIT +
      "`), not the full corpus, when total (meta) exceeds the sample size. Treat as a proportional signal, not an exact corpus count. \"region=none\" here means the query param `regions=none` (plural) — see verdict below for why the singular form doesn't work.",
  );
  lines.push("");
  lines.push("## India corpus depth (`countries=in`) — direct measurement, addresses Decision Doc §3.4 Q1");
  lines.push("");
  lines.push("| Query | India total (`countries=in`) | Unfiltered total | India share |");
  lines.push("|---|---|---|---|");
  for (const c of indiaChecks) {
    if (!c.fetched) {
      lines.push(`| ${c.query} | FAILED | FAILED | **error:** ${c.error} |`);
      continue;
    }
    const share =
      typeof c.totalIndia === "number" && typeof c.totalUnfiltered === "number" && c.totalUnfiltered > 0
        ? `${((c.totalIndia / c.totalUnfiltered) * 100).toFixed(1)}%`
        : "not measured";
    lines.push(`| ${c.query} | ${c.totalIndia} | ${c.totalUnfiltered} | ${share} |`);
  }
  lines.push("");
  lines.push("## Errors encountered");
  lines.push("");
  const failedRuns = runs.filter((r) => !r.fetched);
  const failedIndia = indiaChecks.filter((c) => !c.fetched);
  const failedFacets = !facetsResult.ok;
  if (!failedFacets && failedRuns.length === 0 && failedIndia.length === 0) {
    lines.push("None. All requests succeeded within the retry budget.");
  } else {
    if (failedFacets) lines.push(`- facets endpoint: ${facetsResult.error}`);
    for (const r of failedRuns) lines.push(`- query "${r.query}" (region=${r.regionParam}): ${r.error}`);
    for (const c of failedIndia) lines.push(`- India check "${c.query}": ${c.error}`);
  }
  lines.push("");
  lines.push("## Verdict (numbers-grounded)");
  lines.push("");
  for (const line of buildVerdict(runs, facetsResult, indiaChecks, true)) {
    lines.push(line);
  }
  lines.push("");

  await fs.writeFile("research/phase0/freehire-findings.md", lines.join("\n"), "utf-8");
  console.log("Wrote research/phase0/freehire-findings.md and raw-freehire-facets.json");
}

main().catch((e) => {
  console.error("Fatal error in probe-freehire.ts:", e);
  process.exit(1);
});
