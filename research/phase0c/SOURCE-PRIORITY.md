# Discovery Source Priority — combined (Phase 0 + Phase 0c)

Merges the Phase 0/0b company-ATS-watcher findings (`research/phase0/SUMMARY.md`)
with this session's aggregator/ATS/community probes (`research/phase0c/findings.md`)
into one ranked list for the eventual Phase 1 build. **No implementation
sequencing decided here** — that's explicitly out of scope for this
document; this is source *viability and priority* only.

---

## (a) Primary nets — broad multi-company remote feeds

Ranked by confirmed depth, geo/remote signal quality, and India relevance
(OAOS's stated priority).

1. **Himalayas** — `himalayas.app/jobs/api` + `/search`. **New top-tier
   candidate this session.** Search endpoint works exactly as documented
   (no need for the OpenAPI-fallback path). `locationRestrictions` and
   `timezoneRestrictions` were present and populated in **100% of sampled
   postings (24/24)** — this is the only source probed across Phase 0/0c
   that natively solves "remote but geography-restricted" filtering as a
   structured field rather than free text. Structured salary (42–62%
   populated depending on field), full HTML descriptions (100%), standard
   offset pagination, ~100K corpus. **Recommend promoting to co-primary
   net alongside freehire.dev.**
2. **freehire.dev** (Phase 0, Step 1) — confirmed deep worldwide net for
   infra/backend/SRE/devops/security (4–5 figure result counts per query,
   90% real descriptions). India-tagged share is thin (3.4% average) —
   volume backbone, not an India-focused mechanism. Correction carried
   over: use `regions`/`countries` (plural), not the documented singular
   params. Hobby project, no SLA — needs health-check + graceful
   degradation, not treated as guaranteed-available.
3. **Adzuna India** — real, usable, but **only with a tight query**. Broad
   keyword search (`what=kubernetes` alone) returns 10K+ noisy results
   dominated by unrelated postings that happen to mention the keyword.
   Role+"remote" queries (`what=devops+remote`) return small, clean,
   on-target result sets (59 for that query, all genuine remote DevOps
   roles with real INR salaries). **Confirmed: descriptions hard-truncate
   at exactly 500 characters** — usable for discovery/dedup only, never as
   an application-package content source; any downstream use needs a
   click-through to the original posting. Structured salary present when
   populated (30% of sample), not predicted/inferred.
4. **Remotive** — usable secondary net, `category` filtering works
   cleanly, but `candidate_required_location` (100% populated) and
   `salary` (79% populated) are both **free text with inconsistent
   granularity/format** — needs normalization work before it's directly
   comparable to Himalayas' structured fields. Respect their stated
   etiquette (few calls/day; this session used exactly 1).
5. **Jobicy** — lower priority. Structured salary schema exists but was
   **0% populated** in this sample; industry taxonomy is coarse and leaky
   (tagged non-software roles like "Geotechnical Engineer" under
   `"Software Engineering"`) — expect meaningful noise from category
   filtering alone. Geo field populated but free-text/inconsistent
   granularity like Remotive.
6. **Arbeitnow** — **deprioritize.** Confirmed strongly Germany/DACH-
   centric (93% on-site German-city postings in a 100-row sample, only 7%
   `remote: true`). Also exposed a restrictive `x-ratelimit-limit: 5`
   header (window not measured) — a real constraint on any polling
   watcher. Doesn't fit OAOS's global-remote + India priority; keep as a
   documented reject rather than building against it.

## (b) ATS watcher families — company-by-company board watchers

Carries forward the Phase 0 locked list, adds this session's platform-
level (not yet company-matched) confirmations.

**Confirmed with real target companies (Phase 0/0b — unchanged):**

| Company | Platform | Token/tenant | Live postings |
|---|---|---|---|
| Grafana Labs | Greenhouse | `grafanalabs` | 114 |
| ClickHouse | Greenhouse | `clickhouse` | 173 |
| Chainguard | Greenhouse | `chainguard` | 80 |
| Tailscale | Greenhouse | `tailscale` | 38 |
| Sysdig | Lever | `sysdig` | 5 |
| Red Hat | Workday CXS | `redhat` / `Jobs` | 228 (19 remote-india) |
| SigNoz | Ashby | `signoz` | 12 (7 remote) |
| Swirlds Labs | Ashby | `hashgraph` | 2 |

Priority order unchanged from Phase 0: **Greenhouse (build first) →
Workday CXS → Ashby → Lever**, per `research/phase0/SUMMARY.md`'s combined
verdict.

**New this session — platform mechanics confirmed viable, but no target
company matched yet (need a follow-up pass against the Tier 1–3 company
list before these can join the locked watcher table above):**

- **Recruitee** — confirmed public, no-auth (`{company}.recruitee.com/api/offers/`,
  verified against bunq). Rich schema: `remote` boolean, `on_site`,
  `hybrid`, structured `salary{min,max,currency,period}`, `department`.
  Best schema quality of any newly-checked platform this session.
- **Workable** — confirmed public, no-auth, but **split across two
  endpoints**: `apply.workable.com/api/v1/accounts/{slug}` (GET, account/
  company profile) and `apply.workable.com/api/v3/accounts/{slug}/jobs`
  (POST, actual job listings). The `www.workable.com/api/accounts/...`
  form from the conflicting report is dead (404). Job-record shape not
  yet sampled (test company had 0 open postings at probe time).
- **Personio** — confirmed public, no-auth XML feed
  (`{company}.jobs.personio.de/xml?language=en`). Structured position
  records (office, department, `recruitingCategory`) but XML, not JSON —
  a different parse path than the JSON-native platforms above.

**Unresolved — needs a follow-up probe with a verified real customer
before ranking:**

- **SmartRecruiters** — schema/endpoint confirmed working (no auth
  needed), but the one verified company ID tried (`VisaInc`, from
  SmartRecruiters' own API docs) had 0 live postings — volume/shape
  unconfirmed.
- **Polymer** — could not verify against any real customer this session
  (one guess, 422 "organization could not be found"). Don't rank until a
  real Polymer-hosted company is identified.
- **Pinpoint** — could not verify against any real customer this session
  (two guesses, both 404 on a marketing-site shell rather than a job-board
  404 — inconclusive, not a confirmed "doesn't work"). Same treatment as
  Polymer: needs a real customer name before it can be ranked.

## (c) Community/directory sources

- **yc-oss YC directory** (`yc-oss.github.io/api/companies/hiring.json`) —
  **high value, but as a company-discovery feed, not a job-posting feed.**
  1,499 companies flagged `isHiring: true`, 129 (8.6%) plausibly infra/
  devtools/security by subindustry tag (`B2B -> Infrastructure`: 84,
  `B2B -> Security`: 37). Confirmed same-day-fresh via `Last-Modified`
  header. Recommended use: feed these 129 company names into the ATS
  watcher-family probes above (Greenhouse/Lever/Workday/Ashby/Recruitee/
  Workable/Personio) to discover new watchable companies, the same way
  the original 21-company Phase 0 target list was probed — this is a
  *feeder* source for (b), not a direct posting source in its own right.
- **HN Who is Hiring (Algolia)** — usable but needs LLM-assisted parsing,
  not a strict schema. Important mechanical finding: **use the
  `search_by_date` endpoint, not plain `search`**, to reliably find the
  current month's thread — a relevance-sorted `search` call returned two
  stale threads (2020, 2016) instead of the current one. Current thread
  confirmed to exist (`July 2026`, 438 comments) once the correct endpoint
  was used. Comment convention (`Company | Role | Location | ...`) holds
  directionally but field order/count varies per poster — a first-line
  regex will reliably get the company name; role/location/remote
  extraction needs a looser heuristic or an LLM pass. Monthly cadence, not
  a continuous feed — lower priority than the always-on primary nets and
  ATS watchers above, but a reasonable supplementary source given ~40% of
  a sampled comment batch explicitly said "REMOTE."

## (d) Rejected / deprioritized — with reason

- **Arbeitnow** — see (a) above. Wrong geography for OAOS's target
  (Germany/DACH-centric, not global-remote/India), plus an undocumented
  and fairly tight rate limit. Not recommended for Phase 1.
- **Polymer, Pinpoint** — not rejected on merit (no evidence either way),
  but **unrankable without a confirmed real customer** — treat as "needs
  a follow-up probe with a named company," not "doesn't work."
- **AccuKnox, DSR Corporation** (carried over from Phase 0) — Tier 1
  targets, likely on Zoho Recruit / Applytojob respectively per the
  original source brief's own hints — outside every platform family
  probed across Phase 0 and Phase 0c. Still fully unautomated; would need
  a new source-family investigation, not a token/endpoint fix.
- **Teleport** (carried over from Phase 0b) — mechanically coverable via
  Lever but currently 0 live postings on both Lever and Ashby. Not worth
  building a watcher for zero postings.

---

## Combined recommended priority (for whenever Phase 1 sequencing is decided)

1. Greenhouse company-board watcher (4 confirmed companies, 405 postings)
2. Himalayas query-first net (new — best-in-class geo/timezone structured
   filtering, confirmed working as documented)
3. Workday CXS (Red Hat alone: 228 postings, 19 remote-India)
4. freehire.dev query-first net (deep worldwide backbone, India-thin)
5. Ashby (India-relevant hits: SigNoz, Swirlds Labs)
6. Adzuna India (India-specific, needs tight queries, discovery-only due
   to description truncation)
7. Recruitee / Workable / Personio (platform-viable, pending a
   target-company match — likely fed by the yc-oss discovery pass, item 9)
8. Lever (one confirmed source, Sysdig, low volume)
9. yc-oss directory → feeds new candidate companies into items 1, 3, 5, 7
10. Remotive, Jobicy (usable but noisier/free-text; supplementary volume)
11. HN Who is Hiring (monthly cadence, needs LLM-assisted parsing)
12. Manual/Stage-1-2 coverage stays necessary for AccuKnox, DSR
    Corporation (Tier 1, outside every automated family found so far)

**Not recommended:** Arbeitnow (wrong geography), Polymer/Pinpoint
(unverifiable this session), Teleport (zero live postings).
