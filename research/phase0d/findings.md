# Phase 0d — OSS Paid-Work Source Verification: Findings

Research-only session. 25 live HTTP requests total (hard cap), max 1 req/sec.
Raw dumps in `research/phase0d/raw/`. Two probes required one extra
locally-informed follow-up fetch beyond their original per-probe cap
(GSoC endpoint hunting via curl, NLnet's real feed URL, eBPF full-page
fetch, GHSL full-page fetch) — each is flagged inline below and the
session-wide hard cap of 25 was respected throughout.

---

## P1 — LFX multi-foundation intake surfaces

| Foundation | Intake surface | Type | Automatable via GitHub API | Stability |
|---|---|---|---|---|
| CNCF | `github.com/cncf/mentoring/programs/lfx-mentorship/{year}` | GitHub repo, directory-per-term | **Yes** | High — confirmed existing, 200 OK, `2019` term dir present, standard GitHub Contents API |
| LFDT (LF Decentralized Trust) | `github.com/lf-decentralized-trust-mentorships/mentorship-program` | Dedicated GitHub repo | **Yes** | Repo exists (200 OK) — structure not enumerated this session (only repo-existence hit spent; contents listing would be a follow-up call) |
| eBPF Foundation | `ebpf.foundation/mentorship-program/` (static page) → links out to `docs.linuxfoundation.org/lfx/mentorship` (generic LFX docs) | **No dedicated repo** — participates through the generic LFX Mentorship program docs, not a foundation-specific GitHub directory | **No** (not via GitHub API) | eBPF's own page contains zero `github.com` or foundation-specific mentorship links beyond its own charter file. Its mentorship intake rides on the same central JS-app portal as every other non-CNCF/non-LFDT foundation. |
| Central portal (`mentorship.lfx.linuxfoundation.org`) | Confirmed **JS single-page app** — the raw HTML response is chrome only (jQuery/Bootstrap/Angular-style shell, Poppins/Google-Sans-adjacent styling, `<base href="/">`), zero project-listing data present in the served HTML | Client-rendered app, no JSON the static page itself loads | **No** without a browser-render step | This is the "everything else" surface: any foundation without its own dedicated GitHub repo (i.e. every foundation except CNCF and LFDT) funnels through here |

**Verdict — the critical structural claim is confirmed and sharper than
either input report stated:** LFX is not "8 foundations, 8 different
surfaces" — it's a **two-tier split**: (1) a small number of foundations
(confirmed: CNCF, LFDT) that run their own dedicated GitHub repo as the
project-listing mechanism, fully automatable via the plain GitHub
Contents API; and (2) everyone else (confirmed: eBPF Foundation, and by
inference any foundation not named in tier 1) funneling through the
central `mentorship.lfx.linuxfoundation.org` JS app, which is **not**
GitHub-automatable and would need either browser automation or an
undocumented internal API (out of scope per this session's lock).

**Operator-relevant implication:** eBPF Foundation — the single
highest-fit program per the brief — sits in the **non-automatable
tier**. Automating LFX intake only covers CNCF + LFDT out of the box;
eBPF and the rest need either manual calendar tracking or a future
browser-automation probe (separate scope decision, not resolved here).

---

## P2 — GSoC org data — CONFLICT RESOLUTION

- **`api.gsocorganizations.dev`** — root path (`/`) serves a **Redoc-
  rendered OpenAPI documentation viewer** (confirmed via page title
  "GSoC Organizations API", embedded Redoc/ajv bundle, meta description
  "Get json data of the organizations participating in Google Summer of
  Code"), not the data itself. The actual data endpoint was **not
  found within budget**: `/years`, `/2026`, and `/openapi.json` were
  tried as reasonable guesses and all returned 404. This is a
  documented, real, third-party-maintained API — but its exact data
  path is **unmeasured this session**. Do not build against a guessed
  path; the next step is reading the project's own README/repo (a file
  read, not a live endpoint probe) before any implementation work.
- **`summerofcode.withgoogle.com/programs/2026/organizations`** — 200
  OK, but the sampled HTML (first 3000 chars past the `<head>`) is
  entirely meta tags, favicons, and `@font-face` declarations for
  Google Sans — **no organization data visible in the sampled portion**,
  and the page is built with the styling/structure of a client-rendered
  app (heavy webfont preloading typical of a JS framework shell).
  Inconclusive on rendering mode within this session's view-source-only
  constraint, but nothing in the fetched portion suggests server-side
  data — treat as **calendar-only** (timing/eligibility, not
  machine-readable org listings) unless a future session confirms
  otherwise.

**VERDICT:** Neither path is confirmed buildable this session.
`gsocorganizations.dev` remains the *more promising* candidate (it
explicitly advertises JSON org data and is community-maintained
specifically for this purpose) but needs a follow-up read of its
source repo to find the real path — this is a **"needs one more
look," not a locked automatable source**. The Google page is
**calendar-only** pending contrary evidence. GSoC timing itself
(program dates, application windows) is well-known and calendar-track
regardless of which org-data path is chosen.

---

## P3 — Algora via GitHub search API — VERIFIED, NEGATIVE

`GET /search/issues?q="/bounty" in:comments state:open&per_page=5` —
200 OK, `total_count: 22851`.

**This does not surface real, current Algora bounties in a useful way.**
Sampled results are dominated by repos like `mergeos-bounties/*` and
`IcanBENCHurCAT/algo-bounty` — bot-orchestrated / AI-agent-farm-style
repositories with PR titles like "Fix #48: [25 MRG] Catalog SKU:
square_tortoiseshell frame wave2" and dozens of comments each, not
genuine funded open-source bounty PRs on established projects. The
literal `/bounty` substring is common enough across GitHub (22.8K
results) that it surfaces bot/spam noise far more than it surfaces
Algora specifically. No Algora-specific marker (e.g. their bot's exact
comment format, a `algora.io` link) was in the sampled titles.

**VERDICT: rejected as a zero-integration-work path.** Generic GitHub
search on `/bounty` is too noisy to be a usable Algora feed. If Algora
integration is wanted later, it needs Algora's own API/webhook, not
this shortcut — flagged as a real integration-work item, not free.

---

## P4 — Polar API

- `polar.sh/docs` (1 fetch) — 200 OK, but the page is a Mintlify-hosted
  JS documentation app (`mintcdn` asset references, `data-page-mode`
  attributes typical of a client-rendered docs framework) — the actual
  endpoint path/schema was **not extractable from static HTML** within
  this session's single-fetch docs budget.
- `api.polar.sh/v1/issues/?limit=5` (guessed, per the conflicting
  reports' claimed path) — **404**, JSON body `{"detail": "Not Found"}`
  (a clean routing 404, not an auth/403 — meaning the path itself is
  wrong, not merely gated).

**VERDICT: unresolved.** Could not confirm a working unauthenticated
public listing endpoint within the 2-request cap for this probe. Not
rejected outright (Polar is a real, well-known funded-issues platform)
but **not verified buildable this session** — needs either a
JS-rendered docs read or Polar's OpenAPI spec file directly (if
published as a raw file, e.g. on GitHub) in a follow-up session.

---

## P5 — NLnet RSS

Reports guessed `news.xml`; this was **wrong** (`nlnet.nl/news/news.xml`
→ 404 nginx). The real feed, found via an `<link rel="alternate"
type="application/atom+xml">` tag on the homepage, is:

**`https://nlnet.nl/feed.atom`** — confirmed 200 OK, valid Atom XML,
2.6 MB, most-recent entry dated 2026-07-13 (7 days before this
session's date) — **actively maintained, current**.

Content confirmed to carry **both** required announcement types in the
same feed, interleaved:
- Grantee/award announcements: *"67 Open Technology Projects awarded
  NGI grants"*, *"57 Projects Receive NGI Zero Grants to Fix the
  Internet"*, *"44 Digital Commons Projects Selected for NGI Zero
  Grants"*, etc. — relevant to future freelance/outreach targeting
  (these projects just got funded and may need contractor help).
- Call-for-proposal announcements: *"Apply for funding before August
  1st 2026"*, *"...before June 1st 2026"*, *"...before April 1st
  2026"*, *"...before February 1st 2026"* — a recurring quarterly-ish
  cadence.

**Important timing flag surfaced in the feed itself:** an entry titled
*"Transitioning from NGI to Open Internet Stack — open calls
temporarily paused"* — NLnet's NGI-branded funding calls are **currently
paused mid-transition** as of this session's date. Any calendar entry
for NLnet needs this caveat, not a blind "quarterly deadline" assumption.

**VERDICT: confirmed automatable.** Valid feed, correct URL now
recorded, carries both announcement types, actively updated. One
correction from the source reports (wrong URL) resolved.

---

## P6 — ESoC repo

`GET /repos/european-summer-of-code/esoc2026` — 200 OK.
`description`: "European Summer of Code 2026 - Information and Projects".
`archived: false`, `open_issues_count: 2`, `pushed_at: 2026-06-07`
(recent, ~6 weeks before this session — **active for the current
cycle**), `created_at: 2025-03-26`.

**VERDICT: confirmed.** Repo exists, is the current-year term repo (not
a stale prior-year one), not archived, recently pushed to. Project-list
format not enumerated this session (contents listing would be a
follow-up call) but the repo's existence and currency for 2026 is
solid — same GitHub-Contents-API automation pattern as CNCF's LFX repo.

---

## P7 — Outreachy RSS

`outreachy.org/blog/feed/` — 200 OK, valid Atom feed (despite "RSS" in
the ask, it's Atom — same syndication use-case). Confirmed content is
exactly what's expected and useful: alternating *"Call for [Month Year]
mentoring communities"* and *"[Month Year] internship applications
open"* entries going back through 2025 (June 2025, December 2025, May
2026 cycles all present), each with a real dated `<published>`
timestamp. This is purely timing/cadence data — no per-project detail
in the feed itself (confirmed expected: project specifics are manual).

**VERDICT: confirmed automatable for cohort-timing only,** exactly as
scoped. Good candidate to drive the calendar file's Outreachy entries
automatically rather than hand-maintaining dates.

---

## P8 — GitHub Security Lab bounties

`securitylab.github.com/bounties/` (initial 200 OK truncated at 3000
chars; full page re-fetched to check structure — 30,302 bytes total).
Page is a **static marketing page**: headings "Announcement!",
"Product", "Platform", "Support", "Company" (bounty-tier categories,
not a list of currently-open specific bounty targets). No bounty-target
listing, no visible JSON payload, no per-target dynamic content found
in the full page source.

One structural note for a possible future session: the page's `<head>`
references `/feed.xml` at the `securitylab.github.com` root — **this
was not fetched** (session's 25-request hard cap was reached
immediately after confirming its existence in the page source). Its
content/relevance is genuinely unmeasured — flagged as a candidate for
the next research pass rather than assumed useful.

**VERDICT: static page = calendar/manual-track**, consistent with
expectation. The undiscovered `/feed.xml` is the one loose thread worth
a single follow-up fetch next session (not assumed to solve this either
way).

---

## Session housekeeping notes

- Total live HTTP requests: **25 / 25** (hard cap reached exactly,
  not exceeded). Breakdown: 15 from the initial scoped probe script
  (`probe.ts`, one per P1–P8 sub-check) + 10 ad-hoc follow-up `curl`
  calls used to (a) locate GSoC's real data endpoint [not found], (b)
  find NLnet's correct feed URL [found and confirmed], (c) fetch the
  eBPF and GHSL pages in full past the initial 3000-char truncation.
  All follow-ups stayed within "official/public endpoints only, no
  auth-flow probing, no HTML scraping beyond fetching a documented
  page" per the scope lock.
- `GITHUB_TOKEN` from `.env` was used for all `api.github.com` calls —
  authenticated rate limit (5000/hr) confirmed via response headers,
  never at risk of throttling this session.
- Zero 401/403/bot-challenge responses encountered this session — every
  probe either resolved cleanly (200) or 404'd on a genuinely wrong/
  nonexistent path.
