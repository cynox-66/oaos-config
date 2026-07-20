# OAOS Discovery Synthesis — Decision Document

**Date:** 2026-07-16
**Session type:** Read-only research. OAOS repo untouched; external repos cloned to `~/Desktop/oaos-research/`.
**Purpose:** Evaluate four mature open-source AI job-search projects for parts worth borrowing into OAOS — especially discovery (OAOS's weakest layer) — and produce every borrow/keep/hybrid decision the operator must make.

**Repos studied (clone paths relative to `~/Desktop/oaos-research/`):**

| Repo | Clone dir | License | One-liner |
|------|-----------|---------|-----------|
| MadsLorentzen/ai-job-search | `ai-job-search/` | **MIT** (LICENSE, © 2026 Mads Lorentzen) | Claude Code-native job-search framework: 6 portal-search CLI skills + drafter-reviewer application workflow |
| Pickle-Pixel/ApplyPilot | `ApplyPilot/` | **AGPL-3.0** (LICENSE) | 6-stage autonomous pipeline: JobSpy discovery → extraction cascade → scoring → tailoring → auto-submit |
| Gsync/jobsync | `jobsync/` | **MIT** (LICENSE, © 2024 gsync) | Self-hosted Next.js job tracker with MCP server + Greenhouse/Lever official-API discovery |
| feder-cr/Jobs_Applier_AI_Agent_AIHawk | `AIHawk/` | **AGPL-3.0** (LICENSE) | Oldest/largest auto-applier; third-party board plugins removed for legal reasons |

**License implication up front:** code can be copied verbatim from the two MIT repos (ai-job-search, jobsync) into private OAOS with attribution. ApplyPilot and AIHawk are **AGPL-3.0** — copying their code into OAOS is legally safe only if OAOS is never distributed/hosted as a service, but the cleaner rule is: borrow *ideas and architecture* from the AGPL repos, borrow *code* only from the MIT repos. (OAOS is a private personal tool, so AGPL's network clause likely never triggers — but why carry the question at all.)

**OAOS reference points used throughout** (read from the OAOS repo this session):
- `RawItem` = `{source_type, source_name, raw_payload, url, fetched_at}` — `src/engines/normalization/types.ts:66-80`
- Engine 1 normalizes to: company, role, category, comp (INR-normalized), remote, description, domains
- Engine 11 admission checks — `src/engines/source-admission/source-admission.ts:25-64`: cost=0 (or justified), maint ≤ 10 min/wk per source, health-checkable, dedupe-compatible, survives-format-change, global maint budget; `type: "scrape"` → **probation**, not rejection.

---

# PART 1 — DISCOVERY LAYER DEEP-DIVE

## 1.1 LinkedIn `jobs-guest` endpoints (ai-job-search `linkedin-search` skill)

**Where:** `ai-job-search/.agents/skills/linkedin-search/` — `SKILL.md`, `cli/src/helpers.ts`, `cli/src/commands/search.ts`, `url-reference.md`.

**Exact method:** Two public, unauthenticated HTTP GET endpoints (`cli/src/helpers.ts:6-9`):
- Search: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` with query params `keywords`, `location` (free-text place string), `f_TPR` (posted-within window in seconds, e.g. `r604800` = 7 days), `f_WT` (workplace type: 1=onsite, 2=remote, 3=hybrid), `start` (pagination offset, 10/page).
- Detail: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>` — returns one job's HTML with full description, seniority, employment type, job function, industries, apply URL.

Both return **HTML fragments, not JSON**. Parsing is regex-based over job-card markup: cards split on `data-entity-urn="urn:li:jobPosting:<id>"`, fields extracted from CSS-class-anchored regexes (`base-search-card__title`, `base-search-card__subtitle`, `job-search-card__location`, `job-search-card__listdate`; detail page: `top-card-layout__title`, `topcard__org-name-link`, `show-more-less-html__markup`) — `helpers.ts:112-219`. Fetch layer sends a desktop-Chrome User-Agent + `X-Requested-With: XMLHttpRequest` and retries 429/5xx with exponential backoff (500ms→8s, 6 retries) — `helpers.ts:15-49`.

**Auth:** none. No API key, no cookies, no login.

**ToS exposure — the repo's own caveat, verbatim** (`SKILL.md:29-33`):
> ## ⚠️ Personal use only
>
> This uses LinkedIn's public job pages; automated access is against LinkedIn's Terms of Service, so **keep volume low and don't use it commercially or for bulk data collection.** Run it on your own responsibility.

Repeated in `url-reference.md:6`: "Personal use only — automated access is against LinkedIn's Terms of Service; keep volume low."

**Fragility:**
- Breaks on: LinkedIn renaming CSS classes (all extraction is class-name regex), endpoint removal/auth-walling, IP-level bot blocking (LinkedIn is one of the most aggressively defended sites). The repo's own comment concedes the trade: "the markup is shallow and stable; a full DOM parser is unnecessary" (`helpers.ts:3-4`) — i.e., it works because LinkedIn hasn't changed it, not because it can't change.
- Observed breakage in this repo's history: none for LinkedIn specifically (repo is young, first commits 2026). But the sibling Danish portal shows the failure mode: commit `1bc119d` "Report Jobbank Cloudflare blocking clearly (#114)" — the jobbank.dk portal gets Cloudflare-bot-blocked and the skill's answer is "report the portal as unavailable and use WebSearch fallback instead of retrying" (`jobbank-search/SKILL.md:29`). That is the realistic future for any HTML endpoint.
- Rate limiting: LinkedIn 429s are expected and retried; SKILL.md says page size is fixed at 10 and volume must stay low.

**India/remote fit: explicitly yes.** The skill is location-parameterized free text and its own usage examples are Indian (`SKILL.md:71-72`): `search -q "data engineer" -l "Bengaluru, Karnataka, India" --jobage 30`; `-l "Mumbai, Maharashtra, India"` appears at `SKILL.md:50`. `--location "Remote"` + `--remote remote` (`f_WT=2`) covers remote. `url-reference.md:42`: "Country-agnostic: pass any `--location`."

**Output shape → OAOS mapping:**

| linkedin-search emits (`helpers.ts:51-68`) | RawItem / Engine 1 target |
|---|---|
| `id` (numeric job id) | dedupe key material (goes in `raw_payload`) |
| `title` | → role |
| `company`, `companyUrl` | → company |
| `location` | → remote/location inference |
| `date` (ISO from card `datetime` attr) | posting date in `raw_payload` |
| `url` (`linkedin.com/jobs/view/<id>`) | → `RawItem.url` |
| detail: `description` (text, breaks preserved) | → description |
| detail: `seniority`, `employmentType`, `jobFunction`, `industries`, `applyUrl` | → `raw_payload` extras; employmentType helps category |
| — (no salary field) | comp: **absent** — comp_basis "unknown" almost always |

RawItem wrapper is trivial: `source_type: "job_board"`, `source_name: "linkedin"`, `raw_payload: <JobCard/JobDetail JSON>`, `url`, `fetched_at: now`. This is the same shape OAOS's Stage 2 LinkedIn *email* parser already produces, so Engine 1's existing job_board adapter path applies. Two-step cost: getting descriptions requires one `detail` fetch per job (search cards carry no description).

**License:** MIT — the TypeScript CLI can be vendored into OAOS directly.

**Engine 11 admission table:**

| Check | Value | Pass? |
|---|---|---|
| cost_per_month_inr | 0 | ✅ |
| type | `scrape` (HTML parsing, unofficial endpoint) | → **probation** by design |
| est_maint_min_per_week | low until it breaks; breakage = re-derive regexes (~1-2 h event) — amortized ≤10 min/wk is *plausible but optimistic* | ⚠️ |
| has_health_check | yes — a canary query (known-good location) returning 0 cards or non-200 is a clean health probe | ✅ |
| dedupe_compatible | yes — stable numeric job id + canonical URL | ✅ |
| survives_format_change | **no** — regex over CSS class names; any markup rename silently yields 0 results | ❌ |

**Verdict:** fails `survives_format_change` honestly. Under OAOS's own rules this source is admissible only if the operator consciously waives/reframes that check (e.g. "health check detects format change within one run, so failure is loud and bounded"). It is the highest-volume, highest-relevance source in this study *and* the least contractual. Classify: **works-today / ToS-gray / will-eventually-break**.

---

## 1.2 freehire.dev public REST API (ai-job-search `freehire-search` skill)

**Where:** `ai-job-search/.agents/skills/freehire-search/` — `SKILL.md`, `cli/src/helpers.ts`, `cli/src/commands/search.ts`.

**Exact method:** Unauthenticated JSON REST API: `GET https://freehire.dev/api/v1/jobs/search?<params>` (`commands/search.ts:93`), envelope `{data, meta, error}` (`helpers.ts:22-27`). freehire.dev is an open-source aggregator that crawls ~50 ATS platforms and normalizes postings into one schema. Facet discovery endpoint: `/api/v1/jobs/facets`. Params include `q` full-text, `posted_within_days`, `limit`/`page`, and structured facets: `region` (macro-regions incl. `apac`; special value `none` = unresolved-geo bucket), `country` (ISO-3166), `city`, `seniority`, `category` (backend/devops/ml_ai/…), `skill`, `company`, `work_mode` (remote/hybrid/onsite), `salary_min`.

**Auth:** none for search/detail. (Per-user apply/save tracking needs a key; skill deliberately doesn't touch it — `SKILL.md:166-168`.)

**Rate limits / SLA:** retries 429/5xx with backoff; connection failure fails **fast** with a clear error ("graceful-degradation contract", `helpers.ts:29-51`). The repo is explicit that this is a *personal project, best-effort, no SLA* (`SKILL.md:41-49`). Mitigation documented: the backend is a separate MIT repo, `strelov1/freehire` (Go + PostgreSQL + Meilisearch), self-hostable via Docker (`make up`, same `/api/v1` paths), and the skill honors `FREEHIRE_API_URL` — but self-hosting a *fresh* mirror means running its crawlers yourself (`SKILL.md:51-65`).

**ToS exposure:** none — it's a public API published *for* this use. The gray area moves upstream: freehire itself crawls company career pages/ATS platforms; OAOS would be consuming an aggregator's output, not scraping.

**Fragility:** the API contract is versioned (`/api/v1/`) and JSON — no markup parsing. The real risk is **service mortality** (hobby project disappears) rather than format change. Failure mode is loud (non-zero exit, clear message), not silent. No breakage history observable in the skill's tests/commits.

**India/remote fit: partial, honestly documented.** Facets include `region=apac` and `country` ISO codes (so `country=IN` is expressible — but whether India-based postings are actually *present in volume* is **undetermined from code**; the corpus depends on which ATS platforms freehire crawls). Critically, the skill documents that geography facets are often **unresolved**: "A missing region/country means 'not resolved', not 'not applicable' — filtering on `--region eu` silently drops jobs whose region wasn't resolved" and `--region none` sweeps the unresolved bucket, "useful to sweep up remote roles that never pinned a geography" (`SKILL.md:150-162`). For OAOS's remote-first search, `work_mode=remote` + `region none` union is the right query pattern. **Tech-only scope:** filtering vocabularies are tuned tech-first (`SKILL.md:32-39`) — fine for OAOS's domains (Cloud-Native/K8s/eBPF/Infra are exactly freehire's strong suit).

**Output shape → OAOS mapping** (`helpers.ts:83-139`, `FreehireJob`/`JobDetailResult`):

| freehire emits | RawItem / Engine 1 target |
|---|---|
| `public_slug`, `external_id`, `source` | dedupe keys |
| `title` | → role |
| `company`, `company_slug` | → company |
| `location`, `regions[]`, `countries[]`, `cities[]`, `work_mode` | → remote (**directly**, no inference needed) |
| `description` (HTML; skill ships `cleanHtml`) | → description |
| `skills[]` | → domain tagging aid (Engine 1 domains vocab) |
| enrichment: `seniority`, `category`, `employment_type` | → category mapping aid |
| enrichment: `salary_min/max/currency` | → **comp** — the only source in this study emitting structured salary |
| `posted_at`, `url` | → `raw_payload` date, `RawItem.url` |

Richest field coverage of any mechanism studied; the only one that can populate comp.

**License:** skill MIT; freehire backend MIT.

**Engine 11 admission table:**

| Check | Value | Pass? |
|---|---|---|
| cost | 0 | ✅ |
| type | `api` | ✅ (no probation) |
| maint | ~0 — versioned JSON contract | ✅ |
| health check | trivial — `/api/v1/jobs/facets` or a canary search | ✅ |
| dedupe | `public_slug` + `external_id` + url | ✅ |
| survives format change | yes (JSON, versioned path) — service *disappearance* is the residual risk, and it fails loud | ✅ |

**Verdict: cleanest admission pass in the entire study.** Genuinely-stable-API bucket. Residual risks: hobby-service mortality and undetermined India coverage — both testable live in minutes (see Open Questions).

---

## 1.3 RSS portal pattern (ai-job-search `jobbank-search` — Denmark-specific, pattern-relevant)

**Where:** `ai-job-search/.agents/skills/jobbank-search/` (`SKILL.md`, `url-reference.md`, `cli/tests/rss-*.test.ts`).

Akademikernes Jobbank (jobbank.dk): search via **RSS feed** (up to 100 results) + JSON-LD parsing for detail pages, filter vocabulary passed as URL params (`url-reference.md`). Denmark-only — **not** a candidate source for OAOS's market. Documented here because (a) it proves the repo's portal-skill pattern generalizes across transport types (HTML / JSON API / RSS), matching OAOS's Stage 3 "RSS/official APIs" intent; (b) it shows the fragility endgame: `SKILL.md:29` — "Jobbank may block automated requests with Cloudflare bot protection; if that happens, report the portal as unavailable… instead of retrying," plus fix commit `1bc119d`. Sibling Danish skills (jobindex, jobnet, jobdanmark) not further analyzed — same pattern, wrong market.

**Portable idea, not portable source.** The `/add-portal` command (`.claude/commands/add-portal.md`) is a *meta-skill that scaffolds a new portal skill* — an "add a source" workflow OAOS could mirror as "propose source → Engine 11 admission → scaffold parser + tests."

---

## 1.4 JobSpy multi-board scraping (ApplyPilot Stage 1; library: speedyapply/JobSpy)

**Where:** ApplyPilot `src/applypilot/discovery/jobspy.py` (orchestration); the library itself cloned at `JobSpy/` — `jobspy/{indeed,linkedin,glassdoor,google,ziprecruiter,naukri,bayt,bdjobs}/`, `jobspy/model.py`. JobSpy license: **MIT** (© 2023 Cullen Watson). ApplyPilot itself is AGPL — but the discovery mechanism lives in MIT JobSpy; ApplyPilot's wrapper is thin config/storage glue.

**Exact method, per board (from JobSpy source):**
- **Indeed:** NOT HTML scraping — POSTs to Indeed's **undocumented mobile-app GraphQL API** `https://apis.indeed.com/graphql` using a **hardcoded extracted mobile API key** and iPhone-app headers (`jobspy/indeed/constant.py:100-109`, `jobspy/indeed/__init__.py:48`). Country routing via `Country` enum — `INDIA = ("india", "in", "co.in")` (`jobspy/model.py:93`).
- **LinkedIn:** the **same `jobs-guest` endpoint** as §1.1 (`jobspy/linkedin/__init__.py:120`) — HTML card scraping, one detail fetch per job when `linkedin_fetch_description=True`.
- **Glassdoor:** internal GraphQL, historically 403-blocked (see fragility).
- **Naukri (India's largest board):** internal JSON API `https://www.naukri.com/jobapi/v3/search` (`jobspy/naukri/__init__.py:41`) with hardcoded app headers incl. `appid`, `systemid`, and a signed `Nkparam` token (`jobspy/naukri/constant.py`) — works until Naukri rotates that token.
- Also: ZipRecruiter, Google Jobs, Bayt, BDJobs.

Unified output: a pandas DataFrame with `title, company, location, job_url, job_url_direct, description (markdown), min_amount, max_amount, currency, interval, is_remote, site, date_posted` — ApplyPilot's mapping into SQLite at `discovery/jobspy.py:120-182`. Search params: `search_term, location, results_wanted, hours_old, is_remote, country_indeed, proxies` (`jobspy.py:214-229`).

**Auth:** none (all keys are extracted/hardcoded app credentials — that is *worse* than no-auth from a ToS standpoint: it impersonates official clients).

**Rate limits / ToS:** every board here prohibits automated access. ApplyPilot ships first-class **rotating-proxy support** (`jobspy.py:25-56` parses `host:port:user:pass`; JobSpy supports SOCKS5 — commit `94d413b`). Needing proxies is the confession: at any real volume, home-IP access gets blocked.

**Fragility — documented, recurring, this is the core finding.** JobSpy's own recent commit log is a maintenance diary: `fda080a` fix(linkedin) date parsing; `6e8576f` fix(naukri) parse error; `9aae024`/`53b3b41` "glassdoor 403 response by rotating user-agent and updating headers"; `ae2b1ea` "Bdjobs Fixed". ApplyPilot's `sites.yaml` additionally hard-blocklists Glassdoor and Google ("too problematic for automation") and lists ATS domains with "unsolvable CAPTCHAs" (`config/sites.yaml:8-26`). The library only stays alive because a maintainer community patches each breakage within days. Adopting it = adopting that treadmill (mitigated by `pip install -U`, inflated by being load-bearing infrastructure you don't control). Also: ApplyPilot has **no test suite** (commit `f50908d` "Disable CI: no tests yet").

**India/remote fit: yes, best-in-study on paper.** `country_indeed="india"` is a supported enum; **Naukri support is unique to JobSpy** among everything studied; `is_remote` + `hours_old` are first-class. Whether Indeed-GraphQL/Naukri respond cleanly from an Indian home IP without proxies: **undetermined — live test required.**

**Output → RawItem mapping:** near-perfect. `site` → `source_name`; row dict → `raw_payload`; `job_url` → `url`; salary triple (`min_amount/max_amount/currency/interval`) → comp (second source in study with structured comp); `is_remote` → remote; markdown `description` → description. `source_type: "job_board"`.

**Engine 11 admission (as one aggregate source; per-board admission is the better framing):**

| Check | Value | Pass? |
|---|---|---|
| cost | 0 without proxies; proxies (the recommended setup) are paid — ₹500-1500/mo | ⚠️ cost>0 needs justification |
| type | `scrape` (impersonated app APIs + HTML) | → probation at best |
| maint | outsourced to JobSpy maintainers; `pip install -U` cadence ~ok, but breakage windows are days-weeks | ⚠️ |
| health check | yes — canary query per board | ✅ |
| dedupe | `job_url` stable | ✅ |
| survives format change | **no** — five boards × unofficial APIs; history shows repeated breakage | ❌ |

**Verdict:** the "works today, ToS-gray, will break" bucket, stated plainly: this is the highest-yield discovery available (esp. Naukri for India) and the least aligned with OAOS's admission charter. If used at all: one board at a time, on probation, low volume, no proxies, treating JobSpy as an upstream dependency to update — never as OAOS-owned code to maintain.

## 1.5 Workday CXS direct-portal API (ApplyPilot)

**Where:** `ApplyPilot/src/applypilot/discovery/workday.py`, registry `src/applypilot/config/employers.yaml` (305 lines, ~48 employers).

**Exact method:** every Workday-hosted career site exposes the same **undocumented but uniform JSON API**: `POST {base_url}/wday/cxs/{tenant}/{site_id}/jobs` with body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":"<query>"}` → `{total, jobPostings[]}`; detail via `GET {base_url}/wday/cxs/{tenant}/{site_id}{externalPath}` (`workday.py:156-184`). Pure HTTP + JSON — "Zero LLM, zero browser" (`workday.py:4`). Pagination to 500 results (`workday.py:203-206`). Per-employer config is just three strings: `tenant`, `site_id`, `base_url` (e.g. `td / TD_Bank_Careers / https://td.wd3.myworkdayjobs.com` — `employers.yaml:9-13`).

**Auth:** none. **Rate limits:** unknown; code uses plain requests, 30s timeout, optional proxy.

**ToS exposure:** gray but qualitatively milder than board scraping — it calls the same JSON endpoint the public career page itself calls, per-company, read-only, and companies *want* their postings found. No signed tokens, no impersonated app keys.

**Fragility:** the CXS path has been stable for years across all Workday tenants (undetermined from this repo alone, but the uniform-registry design bets on it — one code path, 48 tenants). Failure mode per tenant: site_id renamed → that one employer 404s (loud, isolated). It's JSON, so no markup fragility. Registry rot (companies migrating ATS) is the main maintenance item.

**India/remote fit: registry-dependent.** The shipped registry is Canada/US-oriented (TD, RBC, CIBC, BMO, NVIDIA, Salesforce…). The *mechanism* is global — any company on Workday works, including India-heavy employers — but OAOS would build its own registry of target companies. That inverts discovery: this is **company-first** (watch employers you care about) vs. query-first (search the market). For OAOS that is a feature: it matches the "target list of companies worth outreach" workflow and Engine 5's company-centric contact ranking.

**Output → RawItem:** search emits `title, locationsText, postedOn, externalPath, bulletFields`; detail adds full `jobDescription` (HTML; repo ships a stdlib `_HTMLStripper`), and `jobReqId`. Map: company = registry entry (known a priori — better than parsed), role = title, url = career-site posting URL, comp absent, remote inferred from locationsText. `source_type: "job_board"`, `source_name: "workday:<tenant>"`.

**Engine 11 admission:**

| Check | Value | Pass? |
|---|---|---|
| cost | 0 | ✅ |
| type | `api` (unofficial but structured JSON; honest classification could be `api` or `scrape` — operator call) | ✅/⚠️ |
| maint | near-zero per tenant; registry curation ~minutes/wk | ✅ |
| health check | trivial — POST returns `total` | ✅ |
| dedupe | `externalPath`/`jobReqId` stable | ✅ |
| survives format change | JSON contract, uniform across tenants, years-stable; not *guaranteed* (undocumented) | ⚠️ leaning ✅ |

**Verdict:** the sleeper hit of this study. Near-API stability, zero cost, per-company isolation, and it complements rather than duplicates job-board sources. Middle bucket: **stable-in-practice, undocumented-in-principle.** Excellent Stage 3 candidate *if* the operator has target companies on Workday (many India-relevant majors are).

## 1.6 Smart-extract + 3-tier description cascade (ApplyPilot)

**Where:** `src/applypilot/discovery/smartextract.py` (arbitrary career-site discovery) and `src/applypilot/enrichment/detail.py` (description enrichment).

**Method — enrichment cascade** (`detail.py:7-11`, `scrape_detail_page` at `detail.py:531-594`): for each job URL, Playwright loads the page, then:
1. **Tier 1 — JSON-LD:** parse `<script type="application/ld+json">` for a schema.org `JobPosting` (0 LLM tokens) — `detail.py:215-321`.
2. **Tier 2 — deterministic CSS:** known description-container selectors + apply-button heuristics (0 tokens) — `detail.py:323-394`.
3. **Tier 3 — LLM extraction:** cleaned main-content HTML → one LLM call returning `{full_description, application_url}` — `detail.py:447+`.
It logs "% LLM calls saved" (`detail.py:777-781`) — same pure-logic-first economics as OAOS.

**Method — smartextract discovery** (`smartextract.py:1-13`): for an arbitrary listing site from `sites.yaml` (with `{query_encoded}`/`{location_encoded}` placeholders), Phase 1 gathers "lightweight intelligence" (JSON-LD, XHR API responses, data-testids, DOM stats) and has the LLM *pick a strategy*; Phase 2 (CSS route only) has Playwright find repeating card elements and the LLM generate selectors once, which are then cached and reused deterministically.

**Assessment:** this is not a *source*; it's an **extraction capability**. ToS/fragility follow whatever site it's pointed at (and ApplyPilot's own blocklists show the limits). For OAOS the relevant borrow is narrow: the **JSON-LD JobPosting parser**. Schema.org JobPosting is a *standard*: Google Jobs indexing requires it, so most modern career pages embed a complete structured posting (title, org, location, salary, description, employmentType). A pure `extractJobPosting(html)` function is deterministic, testable, format-change-resilient (it's a standard, not a layout), and would upgrade OAOS's URL-paste intake and any future per-company watcher. The Playwright/LLM tiers conflict with OAOS's zero-cost/pure-first charter and should not be borrowed.

**License caveat:** `detail.py` is AGPL — reimplement the JSON-LD parser fresh (it's ~100 lines against a public standard; no need to copy).

---

## 1.7 Greenhouse Job Board API (jobsync)

**Where:** `jobsync/src/lib/scraper/greenhouse/index.ts`, constants `src/lib/constants.ts:68`, seed registry `src/lib/scraper/greenhouse/companies.json` (~600 companies).

**Exact method:** Greenhouse's **official, documented, public Job Board API**: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` → JSON `{jobs: [{title, company_name, location.name, absolute_url, content (entity-encoded HTML), first_published, updated_at}]}` (`greenhouse/index.ts:6-14, 85-126`). One call returns **every published job on that company's board, with full descriptions** — no pagination, no search endpoint; filtering happens client-side. jobsync fans out over a company watchlist with bounded concurrency (p-limit) and per-token error isolation (`index.ts:129-159`).

**Auth:** none. This API exists *so that* companies' postings get syndicated — it is the intended use, not tolerated use. **ToS exposure: none.**

**Fragility:** minimal — a documented versioned API (`/v1/`). Per-company failure mode: company leaves Greenhouse → 404, loud and isolated. The `content` field is entity-encoded HTML (needs the double-decode dance, `index.ts:39-71`) but that's stable API behavior, not fragility.

**India/remote fit:** company-first, like Workday CXS (§1.5): global mechanism, coverage = your watchlist. Many India-relevant infra/cloud-native companies (and CNCF-orbit startups) run Greenhouse. `location.name` is free text on each posting; remote filtering is client-side string matching.

**Output → RawItem:** `title` → role, `company_name`/watchlist name → company, `absolute_url` → url, decoded `content` → description, `first_published` → date, location → remote inference. Comp: absent. Dedupe: `absolute_url` stable. `source_name: "greenhouse:<token>"`.

**Engine 11 admission:**

| Check | Value | Pass? |
|---|---|---|
| cost | 0 | ✅ |
| type | `api` — official, documented | ✅ |
| maint | ~0 + watchlist curation | ✅ |
| health check | trivial (HTTP status + jobs array) | ✅ |
| dedupe | absolute_url | ✅ |
| survives format change | versioned public API | ✅ |

**Verdict: clean pass.** With freehire (§1.2), one of only two mechanisms in the study that pass admission without an asterisk.

## 1.8 Lever Postings API (jobsync)

**Where:** `jobsync/src/lib/scraper/lever/index.ts`, constants `src/lib/constants.ts:80-84`, seed registry `lever/companies.json` (~1,180 companies).

**Exact method:** Lever's **official public Postings API**: `GET https://api.lever.co/v0/postings/{token}?mode=json&skip=N&limit=100` (EU mirror `api.eu.lever.co`) — paginated with skip/limit, no total; jobsync pages until a short page with a repeat-page guard for boards that ignore `skip` (`lever/index.ts:17-80`). Distinguishes 429 (`rate_limited`) from generic failure (`index.ts:40-43`). Company name is not in the payload — carried from the watchlist entry (`index.ts:72`).

**Auth:** none. Official syndication API. **ToS exposure: none.**

**Fragility:** same profile as Greenhouse — official versioned API, loud isolated per-company failures. Explicit 429 handling suggests observable rate limits at watchlist scale; jobsync adds politeness delays between pages (`index.ts:77-80`).

**India/remote fit:** company-first watchlist, same as §1.7. Lever postings carry structured `categories.location` / workplaceType (see `lever/types.ts`, `lever/mapper.ts`).

**Engine 11 admission: identical clean pass to Greenhouse** (cost 0, official `api`, ~0 maint, trivial health check, stable posting ids/urls, versioned contract).

**Combined Greenhouse+Lever+Workday note:** all three are the *same integration shape* — per-company board fetch from a registry of `{name, token/tenant, base_url}` — which means OAOS can implement them as **one "company ATS watcher" source family** behind a common interface, each board a separately-admitted source. jobsync additionally ships an ATS provider registry abstraction (`src/lib/scraper/ats/registry.ts`) that generalizes exactly this.

## 1.9 JSearch via RapidAPI (jobsync) — noted and excluded

**Where:** `jobsync/src/lib/scraper/jsearch/index.ts` — `https://jsearch.p.rapidapi.com` with `RAPIDAPI_KEY` env (`index.ts:8-9,38-40`).

Query-first aggregator (Google-for-Jobs-backed) with clean JSON. **Requires a RapidAPI key; meaningful volume is paid.** Fails OAOS's cost=0 check absent a documented income justification, which doesn't exist yet. Fine to know it exists as a legal query-first fallback if Stage 3's free sources under-deliver. Not further analyzed.

## 1.10 AIHawk — the cautionary tale (no borrowable discovery)

**Where:** `AIHawk/` — `main.py`, `src/libs/resume_and_cover_builder/`, README.

**What remains:** a Selenium-rendered resume/cover-letter builder (`src/libs/resume_and_cover_builder/`), LLM manager, config schemas. The application-automation core is literally commented out in the entry point — `main.py:25-27`: `# from ai_hawk.bot_facade import AIHawkBotFacade`, `# from ai_hawk.job_manager import AIHawkJobManager`, `# from ai_hawk.llm.llm_manager import GPTAnswerer`. The imports' target modules do not exist in the repo.

**Why (their words, README.md:10):** "AIHawk's core architecture remains **open source**… However, due to copyright considerations, we have removed all third-party provider plugins from this repository."

**What that implies — the study's clearest signal on scraping fragility:** the oldest, most-starred project in this space had to amputate its board-specific automation *for legal reasons, not technical ones*. Board-coupled automation carries a second failure axis beyond format changes: the platform (or its lawyers) can force removal outright. Every "works today, ToS-gray" mechanism in this document (§1.1, §1.4) sits on that axis. AIHawk's remnant pivoted to what was legally safe: document generation. **Nothing here for OAOS to borrow** — its resume builder is Selenium+HTML-template based and weaker than OAOS C6 or ai-job-search's workflow, and it's AGPL besides.

---

## 1.11 RANKING: Stage 3 discovery candidates for OAOS

**Bucket A — genuinely stable (official/public APIs, pass Engine 11 clean):**

1. **Greenhouse + Lever company-board watchers (§1.7/§1.8)** — *top recommendation.* Official APIs, zero cost, zero ToS exposure, near-zero maintenance, full descriptions included, and company-first discovery aligns with OAOS's outreach-centric design (Engines 5/7 want companies, not just postings). Effort: one fetch+map module per ATS against a documented JSON contract; jobsync's MIT code is directly borrowable as reference or vendor.
2. **freehire.dev API (§1.2)** — *top query-first candidate.* Public JSON API, tech-tuned facets matching OAOS's domain vocabulary, the only source with structured salary. Risks: hobby-service mortality (fails loud), India corpus depth undetermined (test live). MIT CLI directly borrowable.
3. **Workday CXS (§1.5)** — *strong third.* Undocumented but uniform and stable JSON; per-company isolation; unlocks large enterprises (incl. India majors) that Greenhouse/Lever miss. Admit as `api`-with-asterisk or `scrape`→probation — operator's classification call.

**Bucket B — works today, ToS-gray, will break (admit only knowingly, on probation, low volume):**

4. **LinkedIn jobs-guest (§1.1)** — highest posting volume and freshness of anything here, explicitly against LinkedIn ToS per the source repo's own docs, silent-failure format risk, aggressive bot defense. If adopted: probation, daily-cap canary, treat every run as revocable. The MIT TypeScript CLI is production-quality and matches OAOS conventions (pure helpers, tests, JSON errors) — the *code* is low-cost to hold even if the *source* dies.
5. **JobSpy multi-board (§1.4)** — only justified by Naukri (India's largest board, unique coverage). Running five gray boards through one library multiplies breakage and contradicts the ≤1 new source discipline. If India-board coverage matters, admit **Naukri via JobSpy alone** (single board, `pip`-updated library, probation) and skip the rest; LinkedIn is already covered by §1.1 at lower dependency weight, and Indeed adds mostly duplicate postings at the highest block-risk.

**Explicitly ranked out:** JSearch (paid — §1.9), smartextract Playwright/LLM discovery (cost + charter conflict — §1.6), Danish portals (market — §1.3), AIHawk (nothing remains — §1.10).

**The risk line, stated plainly:** Bucket A sources can be wired in and forgotten — failure is loud, legal exposure zero. Bucket B sources *will* eventually break or be blocked (JobSpy's commit log and AIHawk's amputation are the proof), and the correct posture is OAOS's existing probation mechanic: expect death, detect it cheaply (health-check canary per Engine 11), and lose nothing when it happens because Bucket A is the backbone.

---

# PART 2 — ENGINE-BY-ENGINE COMPARISON

## 2.1 Scoring

| | Approach (as read from code) |
|---|---|
| **OAOS (Engine 2)** | Two axes: Quality 0-50 + Match 0-50 → Total/Tier S-A-B-C. **Two-pass:** pure rule pass (five deterministic factors, reproducible, hash-tracked inputs) + Gemini pass for three judgment factors; LLM failure degrades to rule-pass-only score (`src/engines/scoring/README.md:3-21,59`). |
| **ApplyPilot** | Single 1-10 scale, one LLM call per job, resume-vs-description, plain-text `SCORE:/KEYWORDS:/REASONING:` format parsed by regex; LLM error → score 0 (`scoring/scorer.py:24-105`). No deterministic component; no decomposition. |
| **MadsLorentzen** | Five-dimension weighted rubric — Technical 30% / Experience 25% / Behavioral 15% / Career-alignment 30%, Location as pass/fail gate — executed *by the Claude agent* reading a markdown framework (`04-job-evaluation.md:9-155`). Two tiers: `/rank` batch triage (posting text only, parallel subagents, JSON out) vs. `/apply` Step 1 full evaluation (adds company research). Motivation/energy filter and "call the employer" step are novel dimensions. |
| **jobsync** | Two-tier funnel: **pure lexical prerank** (IDF-weighted token match on title/keywords/skills + location gate + relevance floor + recency tiebreak — `greenhouse/rank.ts:42-100`) selects top-K; only survivors get the LLM match analysis; the rest are saved un-analyzed (`greenhouse/pipeline.ts:20-31`). |

**Is anyone smarter?** Not on the core rubric — OAOS's two-axis decomposition with a deterministic backbone is already the strongest *scoring* design (ApplyPilot is strictly simpler; MadsLorentzen's rubric is richer in *human* dimensions but is prompt-ware executed by an agent, unreproducible, no degradation story). Two external ideas are genuinely additive:

1. **jobsync's pure prerank gate.** OAOS currently sends every intake through Gemini scoring. At Stage 3 volumes (Greenhouse watchlist fan-out can return hundreds of postings per run), a pure lexical pre-filter (OAOS domain vocabulary + role keywords, IDF against the run corpus) that gates which items consume the 4-Gemini-call pipeline is the difference between fitting in 500 requests/day and not. It's ~80 lines of pure TS, fully testable — squarely in OAOS's pure-logic-first idiom.
2. **MadsLorentzen's motivation/energy dimension** ("will the tasks energize, not just can-you-do-them" + explicit drain factors, `04-job-evaluation.md:74-77`). OAOS's Match axis is capability-shaped; the operator's actual acceptance decisions also hinge on energy/direction. Worth considering as a rubric input to the Gemini pass, not a new engine.

**Verdict: KEEP ours; borrow the prerank gate (jobsync, MIT) as a new pure pre-filter step; optionally enrich the Match rubric with the motivation dimension (idea-borrow, MIT).**

## 2.2 Resume / application tailoring

| | Approach |
|---|---|
| **OAOS (C6)** | Resume variant is a **pure reorder of base content** — cannot introduce fabrication by construction (`application-package/fabrication.ts:8-9`); cover letter passes a **pure, deterministic trace-check** — every claim must trace to profile + evidence inventory + opportunity text; untraceable → flag (`fabrication.ts:3-9,77-102`). No LLM self-judgment (charter rule). |
| **ApplyPilot** | LLM rewrites the resume as structured JSON; code assembles final text; header code-injected never LLM-written (`tailor.py:1-10`). Validation: Layer 1 programmatic (banned words + fabrication watchlist + structure, `validator.py`), Layer 2 **LLM judge** (`tailor.py:305`), up to 5 fresh-conversation retries. BUT the README's "never fabricates" overstates: the judge is told "Adding a closely related tool the candidate could realistically know is a MINOR STRETCH, not fabrication… Only FAIL on MAJOR lies" (`tailor.py:168-171`). |
| **MadsLorentzen** | **Drafter-reviewer two-agent loop** (`/apply`, `.claude/commands/apply.md`): drafter evaluates fit and writes CV+letter; a *fresh-context* reviewer agent researches the company (WebSearch/WebFetch), critiques against candidate profile + behavioral profile + writing style, and returns (A) exact-string JSON edits + (B) narrative suggestions by category (missed keywords / company-specific angles / action-oriented reframing / tone-register mismatch); drafter applies edits, *independently verifies every company claim before inclusion* (`apply.md:168`), then mandatory PDF compile + visual inspect + **ATS text-layer extraction check** (pdftotext) with a keyword coverage table distinguishing covered / synonym-only / missing-have-it / missing-genuine-gap — "Never stuff keywords" (`apply.md:178-255`). Honesty rule on both agents: gaps acknowledged, never smoothed (`apply.md:152`). |
| **AIHawk** | Template-based Selenium-rendered resume builder; no comparable guarantees. Not competitive. |

**The honesty ranking is: OAOS strictest (reorder-only + pure trace), MadsLorentzen next (agent discipline + independent claim verification), ApplyPilot weakest (sanctioned "minor stretches" + LLM-judged).** Nothing external should loosen C6's guarantees.

**But on *quality*, MadsLorentzen's reviewer loop attacks exactly the failure OAOS exhibited on its first real run: the generic cover letter.** The generic-letter problem is not a fabrication problem — it's an *absence of company-specific insight and a single-pass draft with no critic*. The reviewer contributes (a) fresh-context adversarial reading (drafter can't grade its own work), (b) company research injected *at draft time* (OAOS has `researchOpportunity` but C6's letter prompt consumes it thinly), (c) the four critique categories, of which "company/department-specific angles" and "action-oriented reframing" are precisely anti-generic pressure. The structured-edit protocol (Part A exact old_string/new_string JSON) is also mechanically compatible with OAOS: a second Gemini call could return trace-checkable edits that C6 applies and then re-runs the *existing pure fabrication check* over — critic for quality, regex for truth.

**Verdict: HYBRID — keep C6's generation + reorder-only + pure trace-check untouched; add a reviewer pass (one extra Gemini call: critique + structured edits grounded in research.company profile), with every applied edit re-passing the existing fabrication trace-check. Borrow the pattern from MadsLorentzen (MIT); do NOT borrow ApplyPilot's minor-stretch policy.** The ATS text-layer check is desirable later but OAOS outputs aren't PDF-compiled yet — park it.

## 2.3 Outreach & contact discovery — hypothesis VERIFIED

Checked all four repos:
- **ai-job-search:** closest thing in the field — Step 4.5 of `/scrape` generates **LinkedIn people-search *URLs*** (`"<Company> recruiter"`, `"<Company> <role>"`) for the user to open manually; explicitly "a link-generation step, not an automated lookup… never fetch or scrape… never fabricate contacts" (commit `d1e707e`, `job-scraper/SKILL.md` Step 4.5). No ranking, no channel selection, no drafts.
- **ApplyPilot:** no contact discovery or outreach anywhere in `src/` (apply stage fills forms; `extract_emails_from_text` in JobSpy is a posting-parsing util, not contact discovery).
- **jobsync:** `Contact` model is a manual CRM row (name + email, optionally linked to an Interview) — `prisma/schema.prisma:208-218`. User-entered, no discovery, no ranking.
- **AIHawk:** nothing.

**No repo in the field discovers, ranks, or drafts to humans. OAOS's contributor-graph contact layer (Engine 5 + `scripts/github-contributor-scan.ts` + Engine 7 channel-correct drafts referencing matched evidence) is unique — it is the moat. KEEP; invest here, don't dilute.** One cheap idea-borrow: ai-job-search's people-search URL templates cost nothing and could be emitted alongside Engine 5 results as a manual-verification aid for companies where the contributor graph is thin (non-OSS companies).

## 2.4 Tracking / outcomes

| | Approach |
|---|---|
| **jobsync** | Full relational tracker (Prisma/SQLite): Job with status/applied/appliedDate/dueDate, linked Company/JobTitle/Location/JobSource/Resume/CoverLetter, Interview + Contact, Activity log, Tags, Notes, plus automation provenance — `matchScore`, `matchData`, `discoveryStatus`, `discoveredAt`, `createdVia` (which agent/token created the row) and a partial unique index on (userId, jobUrl) for automation dedupe (`prisma/schema.prisma:285-333`). |
| **MadsLorentzen** | CSV tracker + `/outcome` command feeding per-application records that `/setup` later uses to **recalibrate the fit framework** — a lightweight long-term-intelligence loop. |
| **OAOS** | Airtable Opportunities (live) + planned Outcomes table; Engines 9/10/12 (source-performance, income-attribution, long-term intelligence) already specify a *deeper* outcome model than either repo (response→interview→offer→income per source). |

**Verdict: KEEP ours** — OAOS's outcome design is more ambitious and already spec'd; jobsync's tracker is a UI over data OAOS keeps in Airtable. **Borrow two fields into the Airtable schema when Outcomes lands:** `discoveryStatus`/`discoveredAt` provenance on each opportunity (which Stage 3 source produced it — Engine 9 needs this anyway) and `createdVia` (manual intake vs. discover vs. future MCP).

## 2.5 Capabilities OAOS lacks that fit the charter

1. **MCP server over the persistence layer** (jobsync, `src/app/api/mcp/route.ts`, `src/lib/mcp/`): three write tools (add_job / add_question / save_match_result) exposed over Streamable HTTP with per-token auth, **scopes** (`jobs:write`), rate-limiting, and entity resolve-or-create with a "transparency report of what was matched vs. created." For OAOS: an MCP server over the Airtable persistence module would let any Claude session (or the operator's phone) add an opportunity/log an outcome without the CLI — same human-gate, new entry points. MIT code directly reusable as a pattern. Fits charter (no sending, post-approval writes only). Priority: nice-to-have.
2. **JSON-LD JobPosting extractor** (ApplyPilot §1.6): standard-based, pure, testable; upgrades URL-paste intake and per-company watchers. Reimplement fresh (AGPL source; the standard is public). Priority: medium — it de-fragilizes any future scraping OAOS ever does.
3. **ATS text-layer verification** (MadsLorentzen `apply.md` 5d): pdftotext-based check that what a parser sees matches what a human sees + keyword coverage table. Relevant only when OAOS emits compiled PDFs. Park until then.
4. **Pure prerank gate** (jobsync §2.1) — covered above; it's also the volume-control mechanism Stage 3 needs.
5. **Portal-skill scaffolding discipline** (ai-job-search `/add-portal` + per-portal SKILL.md contract + `enabled:` toggle + lint tooling `tools/lint_skills.py`): the *operational pattern* for adding/disabling sources without touching the orchestrator. OAOS's Engine 11 is the admission *decision*; this is the admission *workflow*. Idea-borrow.

**Not applicable/rejected:** auto-submit (ApplyPilot stage 6, AIHawk's amputated core) — violates human gate; Playwright browser automation — cost/complexity; multi-user web UI (jobsync) — OAOS is single-operator CLI+Airtable.

---

# PART 3 — DECISION DOCUMENT

## 3.1 Decision table

Constraint key: **₹** = fits ₹0-100/mo · **hr** = fits <1 hr/wk maintenance · **gate** = human-gate preserved. Effort in Claude Code sessions (S ≈ one focused session).

| # | Decision | Recommendation | Alternative | Cost of rec. | Cost of alt. |
|---|----------|----------------|-------------|--------------|--------------|
| D1 | Stage 3 backbone source | **Greenhouse + Lever company-board watchers** (borrow from jobsync, MIT) behind one "ATS watcher" interface; admit each via Engine 11 as `api` | freehire-only (query-first) | 1-2 S build; ~0 maint; ₹✅ hr✅ gate✅ | narrower company coverage; single hobby-service dependency |
| D2 | Query-first source | **freehire.dev API** (borrow CLI logic from ai-job-search, MIT), `work_mode=remote` + `region apac,none`, after live India-corpus test (Q1) | JSearch RapidAPI | 1 S; ₹✅ (0) hr✅ gate✅; risk: service mortality (loud) | paid — fails cost gate |
| D3 | Workday CXS watcher | **Adopt as third source family**, tenant registry of operator's target companies; operator must pick admission class (`api` w/ asterisk vs `scrape`→probation) | skip until D1 proves value | 1 S; ₹✅ hr✅ gate✅ | loses enterprise coverage (many India majors) |
| D4 | LinkedIn jobs-guest | **Defer.** Hold the MIT CLI as known-good reference; admit only if D1-D3 under-deliver volume, then as `scrape`→probation with canary health check and explicit ToS acceptance by operator | adopt now for volume | ₹✅ hr⚠️ (breakage events) gate✅; ToS risk borne by operator | earlier volume, earlier breakage tax |
| D5 | JobSpy / Naukri | **Naukri-only via JobSpy if India-board coverage is wanted** (pip dependency, single board, probation); skip Indeed/Glassdoor/ZipRecruiter/Google | full JobSpy 5-board | 0.5 S; ₹✅ (no proxies at low volume) hr⚠️ | 5× gray surface, proxy pressure, duplicates |
| D6 | Scoring | **Keep Engine 2; add pure lexical prerank gate** before pipeline for Stage 3 batches (pattern from jobsync rank.ts, MIT) | score everything with Gemini | 1 S; protects 500 RPD budget | rate-limit exhaustion at watchlist volume |
| D7 | Scoring rubric | Optional: add motivation/energy dimension to Match rubric (idea from MadsLorentzen 04-job-evaluation) | leave rubric as-is | 0.5 S prompt+tests | none — cosmetic gap |
| D8 | C6 quality | **Add drafter-reviewer pass**: one extra Gemini critique call returning structured edits grounded in research profile; all edits re-run existing pure fabrication trace-check | keep single-pass generation | 1-2 S; +1 Gemini call/package (RPD fine); gate✅ | generic-letter problem persists |
| D9 | C6 honesty rules | **No change.** Explicitly reject ApplyPilot's "minor stretch" policy; reorder-only + pure trace-check stay | — | 0 | — |
| D10 | Contact/outreach layer | **Keep — unique in the field (verified §2.3).** Optionally emit LinkedIn people-search URLs as manual aid where contributor graph is thin | — | 0.25 S for URL emit | — |
| D11 | Outcomes schema | Keep OAOS design; add `discoveryStatus/discoveredAt/createdVia` provenance fields (from jobsync Job model) when Outcomes table lands | — | trivial, folds into planned work | — |
| D12 | MCP server over persistence | Nice-to-have, later: token+scoped MCP write tools over Airtable layer (pattern from jobsync, MIT) | skip | 1-2 S when wanted | none |
| D13 | JSON-LD JobPosting extractor | Build fresh (~100 lines pure TS + tests) when first per-company watcher or URL-paste enrichment needs it | copy ApplyPilot's | small; standard-based | AGPL contamination |
| D14 | Source-addition workflow | Mirror ai-job-search's portal pattern: per-source module + `enabled` toggle + scaffold checklist tied to Engine 11 admission | ad-hoc per source | folds into D1 design | drift as sources multiply |

## 3.2 Proposed integration sequence (if recommendations adopted)

Dependency-ordered; each phase leaves the suite green and merges independently. Stage 3 items all flow **through Engine 11 admission and the existing normalize()→runPipeline path** — new sources produce `RawItem`s, nothing bypasses.

- **Phase 0 — live probes (no code, ~half a session):** run the Open Questions (§3.4) curls from the operator's machine/IP. Outcome decides D2 ordering and D5.
- **Phase 1 — ATS watcher framework + Greenhouse (1-2 sessions):** `src/discovery/stage3/` with a common `CompanyBoardSource` interface (registry entry → fetch → `RawItem[]`), Greenhouse implementation, watchlist config, Engine 11 admission record, `oaos discover` gains the source family (or a sibling `--source` flag). Unit tests with fixture JSON; live-verify on 2-3 real boards.
- **Phase 2 — Lever + Workday CXS (1 session):** two more implementations of the same interface; registry entries for operator's target companies. (D3 admission classification decided here.)
- **Phase 3 — prerank gate (1 session):** pure lexical pre-filter module + tests; wire into the Stage 3 batch path with a config threshold; per-run stats (scored vs. gated) logged for Engine 9.
- **Phase 4 — freehire query-first source (1 session, conditional on Phase 0 result):** API client + facet config + admission record; same RawItem path.
- **Phase 5 — C6 reviewer pass (1-2 sessions):** critique prompt + structured-edit application + mandatory re-trace-check; A/B the first real package against the earlier generic letter.
- **Phase 6 (optional, operator-triggered):** Naukri-via-JobSpy probation source (D5); LinkedIn jobs-guest probation source (D4); MCP server (D12); JSON-LD extractor (D13) when first needed.

Total core path (Phases 1-5): **~6-8 Claude Code sessions.**

## 3.3 What NOT to take — explicit

1. **Auto-submit, in any form** (ApplyPilot Stage 6 `apply/`, AIHawk's amputated bot core). Violates the human gate. Also excluded: its supporting machinery — Playwright form-filling, screening-question answering, SSO/CAPTCHA workarounds, `manual_ats` fallback lists.
2. **Anything requiring paid APIs**: JSearch/RapidAPI, rotating proxy services (JobSpy's recommended posture), paid LLM tiers. OAOS stays ₹0-100/mo.
3. **ApplyPilot's "minor stretch" tailoring allowance and LLM-judge-as-authority** (`tailor.py:168`). OAOS's fabrication checks remain pure regex/trace, never LLM self-judgment.
4. **Full JobSpy adoption as the discovery backbone.** That would make OAOS a thin wrapper around someone else's fragile pipeline — the exact anti-goal. Discovery breadth must live on Bucket-A sources OAOS controls.
5. **Browser-automation discovery** (smartextract's Playwright tiers, AIHawk's Selenium): cost, fragility, and charter mismatch.
6. **Multi-user web app surface** (jobsync's Next.js/auth/Docker): OAOS is a single-operator CLI + Airtable; borrowing the UI would be scope inversion.
7. **Prompt-ware scoring as replacement** (MadsLorentzen's rubric executed by agent): OAOS's deterministic rule pass + hash-tracked reproducibility is strictly better as an *engine*; take rubric *ideas* only.
8. **AGPL code verbatim** (ApplyPilot, AIHawk): ideas yes, lines no. MIT-only for copied code (ai-job-search, jobsync, JobSpy).

## 3.4 Open questions — need live tests or operator decisions, not guessable from code

1. **Does freehire.dev have usable India/remote corpus depth?** Live test: `curl "https://freehire.dev/api/v1/jobs/facets?q=platform+engineer"` and a search with `work_mode=remote`, `region=apac,none`, then eyeball count/quality for OAOS's domains. 10 minutes; decides D2.
2. **Do LinkedIn jobs-guest endpoints respond from the operator's Indian residential IP** (search + detail, sustained across a week of 1-2 daily canary calls)? Decides whether D4 is even live as an option. Do not infer from this session — must be tested from the operator's own network.
3. **Do Naukri's `jobapi/v3/search` (with JobSpy's shipped `Nkparam` header) and Indeed's GraphQL respond without proxies from that same IP?** Decides D5.
4. **Which target companies are on which ATS?** Operator produces the target-company list; per company, check `boards-api.greenhouse.io/v1/boards/<guess>/jobs`, `api.lever.co/v0/postings/<guess>`, or a `*.myworkdayjobs.com` careers URL. Sizes the Phase 1-2 registries and decides whether Workday (D3) is worth Phase 2 inclusion.
5. **Greenhouse/Lever rate behavior at watchlist scale** (50+ boards nightly): undetermined from jobsync's code beyond its 429 handling and politeness delays. Measure during Phase 1 live-verify.
6. **Operator decisions pending:** D3 admission classification for Workday (`api` vs `scrape`); whether D4/D5 ToS-gray sources are acceptable at all (the charter tolerates `scrape` via probation — but ToS acceptance is an operator value call, not an engineering one); D7 rubric addition yes/no.
7. **freehire service continuity:** no SLA (per its own SKILL.md). Mitigation if adopted: health-check canary + the documented `FREEHIRE_API_URL` self-host escape hatch — but self-hosting a fresh mirror is heavy (their caveat, `freehire-search/SKILL.md:62-65`). Accept as a probation-style watch item even though it's an `api` type.

---

*End of document. Compiled 2026-07-16 from direct source reads of the five repos listed in the header; every mechanism claim cites the file it was read from. OAOS repo was not modified.*

---

## ADDENDUM 2026-07-19 — Phase 0c/0d verification results & new decisions

Phase 0c (aggregator/ATS probes, research/phase0c/):
- Himalayas promoted to co-primary net: locationRestrictions/
  timezoneRestrictions structured fields confirmed populated 24/24 —
  the only source found that natively solves "remote but
  geography-restricted" filtering.
- Adzuna: descriptions hard-truncate at 500 chars — discovery/dedup
  use only, never a content source. Usable for India only with tight
  role+remote queries.
- Workable and Personio confirmed public no-auth (Workable split
  across v1 account + v3 POST jobs endpoints; www.workable.com form
  is dead). Recruitee confirmed (verified via bunq). Pinpoint/Polymer
  unrankable — no real customer verified.
- Arbeitnow rejected: Germany/DACH-centric, tight rate limit.
- yc-oss classified as a feeder (companies → ATS watcher probes), not
  a posting source. HN Who-is-Hiring: must use search_by_date, not
  search (plain search returns stale threads).
- Full ranking: research/phase0c/SOURCE-PRIORITY.md.

Phase 0d (OSS paid-work probes, research/phase0d/):
- LFX structural finding: two-tier split. CNCF + LFDT run dedicated
  GitHub repos (automatable via Contents API); ALL other foundations
  incl. eBPF Foundation ride the JS-rendered central portal (not
  automatable without browser automation — out of charter scope;
  calendar-track).
- Five sources locked buildable: CNCF LFX repo, LFDT repo, ESoC repo,
  NLnet feed.atom (URL corrected from reports' news.xml; NGI calls
  currently PAUSED mid-rebrand per the feed itself), Outreachy Atom
  feed (timing only).
- Algora-via-GitHub-search VERIFIED REJECTED: "/bounty" query returns
  22.8K bot-farm results; real integration would need Algora's own
  API.
- Unresolved threads deferred to point-of-use in Phase 1 (not a new
  research phase): GSoC data endpoint (read gsocorganizations.dev
  repo README), Polar OpenAPI spec, GHSL /feed.xml, LFDT repo
  internal structure.
- Full source list: research/phase0d/FINAL-OSS-SOURCES.md.

New design decisions (operator-approved, this session arc):
- D15 — Discovery scope is USER-CONFIRMED at setup, never silently
  inferred. Query generator proposes a field map derived from resume/
  profile (pre-ticked); operator confirms/unticks/adds before any
  search runs. User-added fields with no supporting evidence are
  legitimate search targets (flagged aspirational vs evidence-backed
  for honest Match-score presentation). Field taxonomy derives from
  the normalization engine's existing domain vocabulary plus work-type
  dimensions, so discovery scope and scoring stay aligned. Saved to
  preferences.json, re-runnable anytime.
- D16 — Charter amendment (operator-approved): "custom frontend"
  exclusion relaxed to permit a LOCAL, self-hosted web UI served by
  OAOS on the user's machine. Hosted/multi-tenant deployment remains
  excluded. Public website = static docs only. Sequencing: discovery
  layer first, UI after.
- D17 — Product model: single-operator, open-sourceable,
  bring-your-own-keys (Gemini + Airtable per user). Hosted SaaS
  explicitly out of scope.
- D18 — Non-automatable opportunity categories (research fellowships,
  corporate fellowship programs, technical-writing payouts, remaining
  LFX foundations, AI-safety fellowships pending operator scoping
  decision) live in a static calendar file feeding Stage 1 intake on
  schedule — content-authoring task, not engineering.

Research arc CLOSED. Phases 0/0b/0c/0d complete: 118 + 26 + 25
requests across four probe sessions. Next artifact: consolidated
all-category source map + Phase 1 build plan.
