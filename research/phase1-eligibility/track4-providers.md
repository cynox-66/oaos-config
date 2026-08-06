# Track 4 — Provider mapping

**Date:** 2026-08-06. **Probe requests this track: 18** (Adzuna 12, Himalayas 6).
Session ledger after this track: 29 of 60 (Himalayas 9/20, Adzuna 13/15,
freehire 1/12, Remotive 1/1, Greenhouse 5/8+12).

## 4a. Every source vs. the real constraints

Constraints: (1) entry-level intent expressible in the REQUEST; (2) geo
eligibility as a structured field; (3) carries roles a 2029-graduating student
in India could hold; (4) Engine 11 admission cost (32 of 50 min/wk spent, 18
remain). M = measured this session or in a recorded probe; I = inferred.

| source | (1) entry-level in request | (2) geo structured | (3) India-holdable roles | (4) admission |
|---|---|---|---|---|
| greenhouse (4 boards, ACTIVE) | NO — no query exists (M) | **YES** — location.name 446/446 + offices[] (M, Track 1 Amendment A) | **~0–1/run measured**: 8 India postings in 324, mostly GTM; Chainguard "General Internship" is US-remote (M) | admitted (Wave 3) |
| lever (Sysdig) | NO — no query (M, API shape) | likely — structured `categories.location`/`workplaceType` (I, Phase 0/synthesis doc; unprobed) | Sysdig 5 postings, India presence unknown (M, Phase 0) | admitted (Wave 3) |
| workday (Red Hat) | PARTIAL — `searchText` is free text; "intern"/"entry" expressible but unprobed (I) | PARTIAL — `searchText="remote india"` matched 19/228 in Phase 0 (M); response `locationsText` free text (I) | **19 remote-India postings from one tenant** — the largest recorded India-relevant pool in any registry source (M, Phase 0) | admitted (Wave 3); COST: ~24 req/run (#16 × pagination) |
| ashby (SigNoz, hashgraph) | NO (I) | unknown — has location fields, shape unprobed (I) | SigNoz 7 remote of 12 — Phase 0's only India-focused engineering hit; SigNoz is an Indian-founded observability co. (M, Phase 0) | admitted (Wave 3) |
| himalayas | **YES — measured in isolation this session** (see 4d) | **YES — best-in-class** (Track 1) | 6/56 sampled India-eligible incl. 2 worldwide (M) | admitted (Wave 5) |
| freehire | **YES-ish — `seniority` facet exists in the corpus (junior 83k, intern 53k, Phase 0 facets)**; as a request param: unprobed (I) | YES — `countries` ISO codes 76% + request-side `countries=in` filter (M) | 132 India-remote for one query measured Phase 0; 3.4% share; staffing-agency-heavy (M) | admitted (Wave 5) |
| adzuna | **NO — CONFIRMED COLLAPSE** (4d: 0 results on all 6 terms) | structural — India by URL path (M) | yes but noisy, onsite-heavy, 500-char truncated (M) | admitted (Wave 5) |
| remotive | NO — no query at all (M, Wave 5) | free text, 100% populated, parseable, explicit "Worldwide" (M) | 6/31 sampled Worldwide; category filter unreliable (M) | admitted (Wave 5) |
| hn-hiring | NO — fixed 2 requests, scope drives prefilter only (M, Wave 5) | NO — prose only (I) | some; thread skews senior US (I) | admitted (Wave 5) |
| esoc | NO (repo listing) | **ambiguous — "European" Summer of Code; eligibility rules not modeled** (I — flag for operator) | mentorship-shaped = student-fit BY DESIGN (I) | admitted (Wave 4) |
| nlnet | NO (feed) | grants are worldwide-friendly (I) | grants/contract work, not entry jobs; adjacent fit (I) | admitted (Wave 4) |
| ghsl | NO (feed, dormant 0 entries) | n/a | bounty-shaped, skill-gated not seniority-gated (I) | admitted (Wave 4) |
| cncf-lfx / lfdt / outreachy | calendar-only by D18 | n/a (calendar) | **best category-fit in the whole table**: mentorship programs are built FOR students, stipended, worldwide incl. India (Outreachy explicitly) (I) | admitted (Wave 4) |
| Recruitee / Workable / Personio / SmartRecruiters (no company matched yet) | varies | Recruitee: structured `remote` boolean + salary — best schema of the new platforms (M, Phase 0c) | unknown until Wave 7 matches companies | NOT admitted — each ~2-3 min/wk, fits the 18 remaining |
| yc-oss feeder | n/a (feeder) | n/a | 129 infra/security-tagged hiring companies → feeder for Wave 7 (M, Phase 0c) | not a source; feeds registry |

**Reading of the table against the corrected premise (geo is the binding
constraint):** the sources that structurally cannot have the geo problem —
Adzuna (India-scoped), India-presence companies via registry (Red Hat Workday,
SigNoz Ashby), and the OSS-mentorship calendar track — are precisely the least
activated parts of the estate. The activated source (Greenhouse×4 US/EU
remote-first boards) is measured at ~0–1 eligible engineering roles per run.
The one active-family lever with immediate effect is Himalayas (geo-filterable,
entry-level-steerable, already built and admitted, `enabled: false`).

## 4b. The Phase 0 India-platform rejection — RECORD NOT FOUND (reported, per drift discipline)

**The rejection this track was asked to re-examine does not exist in the
repo.** Searched `research/` (phase0, 0c, 0d), `docs/`, ROADMAP.md for
Internshala and India-platform terms: no mention of Internshala (or Instahyre/
Cutshort/Hirist/Foundit) appears anywhere. What the record actually contains:

- **D5 (synthesis doc):** Naukri — India's largest board — deferred, NOT
  rejected on quality: "Naukri-only via JobSpy if India-board coverage is
  wanted (pip dependency, single board, probation)". Grounds: ToS-gray
  (impersonated app headers, signed `Nkparam` token), scrape-family fragility,
  JobSpy maintenance treadmill. Those grounds are **independent of the
  quality-vs-geo premise** — they hold or fail on their own terms either way.
- **Arbeitnow:** rejected for being DACH-centric — the *mirror image* of the
  geo constraint, evidence the geo axis was already being applied to sources,
  just never to postings.
- **Freelance/gig discovery:** deferred by locked operator decision
  (unrelated grounds).

**Evidence both ways under the corrected premise, as instructed:**

*For revisiting the India-platform category:* (i) geo eligibility is now the
measured binding constraint (25/25 of the current passed set ineligible —
Track 2); (ii) India platforms are structurally geo-clean the same way Adzuna
is; (iii) Phase 0's India-focused target companies (AccuKnox, Last9, One2N,
Appsmith…) were 0-for-13 on Greenhouse/Lever/Ashby tokens — Indian companies
disproportionately use platforms outside the current families, so the current
estate structurally under-covers India employers.

*Against:* (i) D5's ToS/fragility grounds for Naukri are unchanged by the
premise correction — the cost side of that ledger was never "quality";
(ii) no India platform has been probed for a public API — the automatable-
mechanism question is simply open, and a Phase-0-style bounded probe
(Internshala/Naukri/Instahyre: does a public JSON endpoint exist, what are its
ToS) is the prerequisite for ANY ruling; (iii) Adzuna India + freehire
`countries=in` + Workday Red Hat already provide partially-geo-clean channels
that are built and idle — cheaper to activate than to build a new family.

**Not recommended either way** (per instructions). The concrete gap: one
bounded probe session would convert this from "no evidence" to "rulable".

**India-hiring infra/security/cloud-native companies (the AccuKnox category):
an automatable shape EXISTS and is already built — it is registry expansion,
not a new engine.** Evidence: Red Hat (Workday, built adapter, 19 remote-India
postings), SigNoz (Ashby, built adapter, 7 remote), Swirlds/hashgraph (Ashby,
2), ClickHouse India (11 postings, INSIDE an already-activated board — Grafana
also posts India GTM roles). The yc-oss feeder (129 infra/security companies)
plus an India-presence lens is the Wave 7 mechanism for finding more. The
exception: AccuKnox itself (Zoho Recruit) and DSR (Applytojob) sit outside
every built family — a new-family investigation, cost unknown, still unprobed.

## 4c. Himalayas activation readiness

Everything an activation prompt needs, with divergence from Wave 5 noted:

- **Request shape at 13 enabled fields:** 13 GET requests (one per field,
  `q=<term>`), + 1 healthCheck = 14/run. No pagination exists (limit/offset
  ignored — Wave 5, not retested); each query returns the top ~20 of its
  match set. Fixed ~260 upper bound on fetched items before dedupe.
- **Expected volume (measured today):** 56 distinct jobs from 3 terms (20/17/
  19 per term, low cross-term overlap in this sample). Wave 5 measured 209
  fetched → 23 passed of 25 in a mixed batch. Term-level `totalCount` today:
  kubernetes 33, security 510, backend 699.
- **Geo yield (the reason to activate it):** 11% of sampled postings
  India-eligible (6/56) vs Greenhouse's 2.5% (8/324 deduped) — and its geo
  field is the trustworthy structured one (Track 1d: 0 disagreements).
  Post-geo-filter expected yield: ~5-25 eligible items/run vs Greenhouse's ~8.
- **Prerank interaction with a Greenhouse batch:** Wave 5 recorded Himalayas
  taking 23/25 slots at 43% of a mixed batch (IDF favors its rich full-HTML
  descriptions). Expect the same against Greenhouse: a combined run will be
  Himalayas-dominated in the passed set unless geo filtering (which guts the
  Greenhouse side anyway) rebalances it. Not re-measured — would need a
  combined replay (possible offline later with today's captures).
- **Health-check cost:** 1 request (query_net family does not have #16's
  company_board 2× re-fetch; its healthCheck is a single canary).
- **Content path caveat (#21):** Himalayas `description` reaches
  `cleanDescription` directly. Measured today: the API returns **literal
  HTML** (`<p>`, `<div>` — my strip regexes operated on raw tags), NOT
  entity-escaped like Greenhouse. So the `stripHtml` entity-ordering path is
  not exercised; no blocker observed.
- **Divergence from Wave 5 records:** none observed — same endpoint, same
  ~20-item pages, same field names, `totalCount` still present.

## 4d. A3 — entry-level query modifier: both questions settled

**Adzuna 4-token probe — COLLAPSE CONFIRMED, gate stays closed.** Measured
2026-08-06, 6 terms × 2 arms (12 requests), `max_days_old=14`:

| term | `<term> remote` count | `<term> remote entry level` count |
|---|---|---|
| kubernetes | 0 | 0 |
| security | 49 | **0** |
| backend | 5 | **0** |
| observability | 1 | **0** |
| networking | 43 | **0** |
| data | 115 | **0** |

Adzuna's `what` param ANDs every token; "entry level" must appear literally
in the posting. **Enabling A3 with Adzuna in the composition zeroes the
source.** Any future A3 enablement must exclude Adzuna from modifier
composition (one-line change in its `searchUrlFor`) or A3 stays off. Also
noted: kubernetes at 0 even in the 2-token arm — Adzuna India's 14-day remote
window is thin and volatile.

**Himalayas A3 in isolation — measured, no collapse, behaves as re-ranking.**
3 terms × 2 arms (6 requests), NO seniority exclusions involved (fetch-side
only, so A1 cannot contaminate this measurement):

| term | plain totalCount | +"entry level" totalCount | returned page |
|---|---|---|---|
| kubernetes | 33 | 36 (+9%) | 20 / 20 |
| security | 510 | 54 (−89%) | 19 / 19 |
| backend | 699 | 106 (−85%) | 19 / 20 |

The page size stays ~20 either way — since Himalayas only ever yields its
top ~20, the modifier's real effect is **re-ranking the visible 20 toward
entry-level matches**, not volume loss. The kubernetes case (totalCount rose)
shows the search is relevance-OR, not hard AND — no collapse mode exists.
This also retro-validates V2: the 83%-retained figure was fetch-side and
therefore WAS A3-in-isolation all along; the "exclusions active in both
arms" caveat only ever applied to gating stats downstream.
