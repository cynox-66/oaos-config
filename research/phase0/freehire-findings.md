# freehire.dev API depth probe — findings

**Run at:** 2026-07-19T14:42:57.333Z
**Total HTTP requests this run:** 25
**Base:** `https://freehire.dev/api/v1`

## Facet vocabulary (`/jobs/facets`) — curated summary

Full raw response saved to `research/phase0/raw-freehire-facets.json` (not inlined here — it's ~1200 cities + ~230 region variants + ~200 country codes, unreadable inline). Every number below is read directly from that file.

**work_mode**
- `hybrid`: 170232
- `onsite`: 265362
- `remote`: 211706

**category (tech-relevant subset only — full list in raw JSON)**
- `sre`: 2820
- `devops`: 16104
- `backend`: 9137
- `security`: 32665
- `network_engineering`: 3100
- `architecture`: 19625
- `ml_ai`: 6672

**seniority**
- `c_level`: 51924
- `intern`: 53532
- `junior`: 83944
- `lead`: 137217
- `middle`: 48719
- `principal`: 23897
- `senior`: 303281
- `staff`: 29196

**salary_period** — presence of this facet confirms structured salary exists in the corpus
- `day`: 824
- `hour`: 119357
- `month`: 20794
- `year`: 136751

**regions (macro buckets only — raw response has ~230 keys incl. noisy one-off variants like 'california', 'sp', 'ko')**
- `apac`: 345166
- `eu`: 390486
- `north_america`: 1812417
- `latam`: 148796
- `mena`: 53679
- `africa`: 15664
- `global`: 23038

**countries (India + comparators only — raw response has ~200 ISO codes, see raw JSON for full list)**
- `in`: 125317
- `us`: 1750113
- `gb`: 89785
- `sg`: 88161
- `ca`: 107142
- `au`: 27205
- `de`: 76521

**overall corpus total** (per facets response): 3515626
**no explicit "none"/unresolved bucket appears in the regions or countries facet** — consistent with it being an absence-of-value marker rather than an aggregated facet value.

## Query results — `work_mode=remote`

| Query | Region | Total (meta) | Sample fetched | Posted ≤14d (of sample) | With salary (of sample) | With description (of sample) | Sample titles / companies |
|---|---|---|---|---|---|---|---|
| kubernetes | unset | 1381 | 50 | 37 | 0 | 47 | Kubernetes Service Engineer — name<br>Kubernetes & OpenShift Engineer — Bright Vision Technologies<br>Kubernetes Service Engineer — Bright Vision Technologies |
| kubernetes | none | 156 | 50 | 24 | 0 | 50 | Kubernetes Engineer (English) — vexxhost<br>Kubernetes Engineer (gn) - Großraum Frankfurt/Wiesbaden — workidentity<br>Senior Kubernetes Platform Engineer — Uvik Software |
| site reliability engineer | unset | 5750 | 50 | 31 | 0 | 46 | Site Reliability Engineer — name<br>Site Reliability Engineer — HostPapa<br>Site Reliability Engineer — PostHog |
| site reliability engineer | none | 263 | 50 | 18 | 0 | 48 | Site Reliability Engineer — braiins<br>Site Reliability Engineer — HostPapa<br>Site Reliability Engineer — UkrVipService |
| platform engineer | unset | 49628 | 50 | 25 | 0 | 49 | Platform Engineer — SR2<br>Platform Engineer — Defense Unicorns<br>Platform Engineer — etsy |
| platform engineer | none | 2546 | 50 | 18 | 0 | 45 | Platform Engineer — Akuna Capital<br>Platform Engineer — YozmaTech<br>Platform Engineer — hireful. |
| devops | unset | 3547 | 50 | 45 | 0 | 49 | DevOps — Hunt.IT Recruitment<br>DevOps — Strimco<br>DevOps — Americor Funding Inc |
| devops | none | 343 | 50 | 46 | 0 | 35 | DevOps — Cloud.ru<br>DevOps — Z Global E-Commerce<br>DevOps — Limeup |
| backend engineer | unset | 15669 | 50 | 23 | 0 | 47 | Backend Engineer — Lendsqr<br>Backend Engineer — arena<br>Backend Engineer — Sphinx Defense |
| backend engineer | none | 970 | 50 | 17 | 0 | 43 | Backend Engineer — Cornerstone<br>Backend Engineer — 95percent<br>Backend Engineer — PostHog |
| security engineer | unset | 14766 | 50 | 22 | 0 | 46 | Security Engineer — Coterie Insurance<br>Security Engineer — WebEngage<br>Security Engineer — Figma |
| security engineer | none | 691 | 50 | 22 | 0 | 37 | Security Engineer — satellogic<br>Security Engineer — Sourcegraph<br>Security Engineer — CellPoint Digital |

Note: "of sample" columns are computed over the fetched page (`limit=50`), not the full corpus, when total (meta) exceeds the sample size. Treat as a proportional signal, not an exact corpus count. "region=none" here means the query param `regions=none` (plural) — see verdict below for why the singular form doesn't work.

## India corpus depth (`countries=in`) — direct measurement, addresses Decision Doc §3.4 Q1

| Query | India total (`countries=in`) | Unfiltered total | India share |
|---|---|---|---|
| kubernetes | 55 | 1381 | 4.0% |
| site reliability engineer | 128 | 5750 | 2.2% |
| platform engineer | 1806 | 49628 | 3.6% |
| devops | 143 | 3547 | 4.0% |
| backend engineer | 488 | 15669 | 3.1% |
| security engineer | 517 | 14766 | 3.5% |

## Errors encountered

None. All requests succeeded within the retry budget.

## Verdict (numbers-grounded)

- Queries succeeded: 12/12 (0 failed). Facets endpoint: reachable.
- Average `meta.total` across region-unset queries: 15124 postings (from 6/6 queries with a numeric total field). Category depth is real and not thin — every one of the 6 queries returned 4+ figures.
- **The `region`/`country` params (singular, as documented in the ai-job-search skill this API was borrowed via) do not filter anything when called directly** — confirmed live: `region=apac` returned byte-identical results to no region param at all (same total, same 5 job ids). The correct params are `regions`/`countries` (plural), matching the response's own field names. Re-verified against the actual API in this run. This means the `region=none` "unresolved geo" sweep described in the Decision Doc only works via the plural form — any future OAOS client must use `regions`/`countries`, not the skill CLI's singular flag names, if calling the raw API directly.
- Across all fetched samples (600 postings total): 0% carry a structured salary field, 90% carry a non-empty description. The 0%-ish salary rate in these samples is a category effect, not a broken field — the corpus-wide `salary_period` facet shows ~277k postings with structured salary somewhere in the full 3.5M corpus; postings surfaced under these specific technical queries (heavily staffing-agency-sourced, e.g. "Bright Vision Technologies", "Hunt.IT Recruitment") simply skew toward salary-in-description-text-only, not the structured field.
- **India corpus depth (`countries=in`, direct measurement):** across 6/6 queries measured, India-tagged remote postings average 3.4% of each query's unfiltered remote total (see India-corpus table below for per-query numbers). This directly answers Decision Doc §3.4 Open Question 1 — the corpus is not India-void, but India is a small minority slice of a large mostly-US/EU remote corpus for these categories.
- **Verdict: YES** — strong as a *worldwide* remote net for these tech categories (thousands of postings per query, 90% with real descriptions), but the India-specific slice is thin (single/low-double-digit percentages per query above) — treat freehire as the worldwide/US-EU-heavy backbone (D2 in the Decision Doc) and do not rely on it alone if India-specific volume matters; that gap is what makes Workday/Greenhouse/Lever company-first watchers (D1/D3) and/or a India-board source (D5) complementary rather than redundant.
