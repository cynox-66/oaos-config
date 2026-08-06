# Track 1 — Geo eligibility (P1)

**Date:** 2026-08-06. Research session, no production code touched.
**Probe requests this track: 11** (Himalayas 3, freehire 1, Remotive 1, Adzuna 1,
Greenhouse 5). Raw payloads: `research/phase1-eligibility/raw/`.
Every claim below is **measured** unless explicitly labeled *inferred*.

---

## Headline

**The premise of this session's framing is partially wrong, in a good way.**
The prompt said the restriction "lives in prose or an application-form
dropdown. Nothing in OAOS models it." Measured reality: on all four activated
Greenhouse boards the restriction ALSO lives in `location.name` and
`offices[]` — machine-readable on the same list endpoint OAOS already calls,
at zero extra HTTP cost. All six operator-verified ineligible postings are
identifiable as not-India-eligible from `location.name` alone. The gap is that
OAOS discards this signal, not that the sources withhold it.

---

## 1a. How each source expresses geo restriction

### Himalayas — structured, best-in-class, re-verified fresh (56 postings, 3 requests)

Sample: `q=kubernetes` (20) + `q=devops` (17) + `q=backend` (19), deduped by
`guid` → 56 distinct postings, 2026-08-06.

| property | measured value |
|---|---|
| `locationRestrictions` populated | 54/56 (96%); **2/56 empty array** |
| `timezoneRestrictions` populated | **56/56 (100%)** — never empty |
| null / absent-key rate | 0 for both fields — always present, always an array |
| value type (location) | array of **English country names** (ISO-3166 short names: "United States", "Russian Federation", "Congo, The Democratic Republic of the", "Côte d'Ivoire") — NOT ISO codes |
| value type (timezone) | array of **numeric UTC offsets** (−11…14, incl. fractional 5.5, 5.75, 8.75, 12.75) |
| cardinality (location) | 50/56 exactly one country; 2× two; 1× three; 1× 11; 1× 148; 2× zero |
| India-eligible in sample | 6/56 (11%): 4 explicit "India" + 2 empty-array worldwide |

**The unrestricted-worldwide shape (the "most important detail"):** an
**empty `locationRestrictions` array**, co-occurring with a
`timezoneRestrictions` array enumerating **all 37 offsets**. Never null, never
an absent key, no "worldwide" sentinel string. Both observed worldwide
postings (REW Technology, Distribusion Technologies) had exactly this shape.
⇒ A filter of the form `loc.includes("India") || loc.length === 0` keeps the
most permissive postings **by construction** — empty means unrestricted, and
that was verified against the descriptions (below), not assumed.

**"Hire from" vs "timezone overlap" — the two fields are distinct and can
legitimately diverge.** Measured case: MindPlus (Pvt) Ltd, DevOps Engineer —
`locationRestrictions: ["Sri Lanka"]`, `timezoneRestrictions: [5.5]`. UTC+5:30
covers both Sri Lanka and India; the location field says Sri Lanka only. So
**timezone eligibility must never be used as a proxy for hire-from
eligibility** — tz 5.5 ⊉ India. No case was observed where the two fields
*contradict* (location country outside the listed timezones); the divergence
runs one way (tz is a superset of loc).

**False-negative risk (empty field + restricting prose): 0/2 observed.** Both
empty-array postings were regex-swept for geo-restricting prose
(located-in / reside / based-in / eligible-to-work / must-be / timezone-only
patterns) — neither contains any. Sample is small (only 2 worldwide postings
appeared); risk not excluded, but no instance found.

**Bonus, load-bearing for 1b synthesis:** the sample contains a **Chainguard
posting** (Senior Software Engineer, Containers — a Greenhouse-origin role)
with `locationRestrictions: ["United States"]`. Himalayas resolves Greenhouse
boards' geo into its structured field — an aggregator doing exactly the
extraction OAOS lacks.

### Greenhouse — see §1b. Answer: yes, three channels.

### freehire — structured, ISO codes, ~76% resolved (50 rows, 1 request)

`q=kubernetes&work_mode=remote&limit=50` (meta.total 1647):

| field | populated | vocabulary |
|---|---|---|
| `countries` | 38/50 (76%) | ISO-3166 alpha-2 lowercase (`us`, `in`, `de`); multi-value arrays occur (one posting: 11 codes) |
| `regions` | 43/50 (86%) | macro buckets `north_america / eu / apac / latam / cis / africa / uk` + **explicit `global`** (4/50) |
| `location` | 46/50 (92%) | free text, mixed language ("Москва", "Homeoffice", "Apex, NC") — do not parse |
| explicit `in` | 4/50 | — |

Unrestricted/unknown = **empty array or null** — and per Phase 0's recorded
finding (re-confirmed by the response shape), **missing means "not resolved",
not "not applicable"**. So unlike Himalayas, freehire's empty is AMBIGUOUS:
it conflates "worldwide" with "geo unknown". `regions: ["global"]` is the only
unambiguous worldwide marker. A `countries`-based eligibility filter here
silently drops the unresolved 24% — the exact hazard the prompt's "most
important detail" question was probing, present at freehire but NOT at
Himalayas. freehire also uniquely supports **request-side** filtering
(`countries=in`, plural — Phase 0 measured it cutting 5266→132), with the same
drops-unresolved caveat.

### Adzuna — structurally exempt (1 request)

The country lives in the **URL path** (`/v1/api/jobs/in/search/...`). Every
result is an India posting by construction; `location.area` is a structured
India-internal hierarchy (`["India","Telangana","Hyderabad"]`). The
remote-from-where problem **cannot occur** — the residual hazard is
remote-vs-onsite (many results are onsite India roles), which the existing
prerank gate already addresses. Verified on `what=devops remote`: 9 results,
all India-located.

### Remotive — free text, 100% populated, explicit "Worldwide" (1 request, the day's whole budget)

`candidate_required_location`: 31/31 populated. Value vocabulary is
comma-joined free text mixing country names, "USA", continent names, and
timezone phrases: `"Worldwide"` (6), `"Brazil"` (7), `"USA"` (5),
`"Americas, Europe, Asia, Africa, Oceania"`, `"USA, CST (UTC-6)"`,
`"Europe, UK, Germany, France, European timezones"`. Parseable with a modest
alias table + substring test for `india|asia|apac|worldwide`; the explicit
`"Worldwide"` sentinel means unrestricted is unambiguous. Never empty in the
sample, so no empty-vs-worldwide trap.

### HN Who-is-Hiring — no structured field (*inferred*, 0 requests)

Comments are free text. The thread's own `Company | Role | Location` posting
convention is honored inconsistently past the company segment (the recorded
Wave-5 finding: only COMPANY is safely liftable). Location, when present, is
prose ("REMOTE (US)", "Onsite Berlin"). No structured geo exists or can
exist. Any HN geo filter would be prose classification — exactly what the
prompt's 1c warning says not to gate on.

### Summary table

| source | geo channel | vocabulary | unrestricted shape | trust |
|---|---|---|---|---|
| Himalayas | `locationRestrictions` + `timezoneRestrictions`, response-side | English country names / UTC offsets | empty array (+ all-37 tz) — unambiguous | verified vs prose, 0 disagreements |
| Greenhouse | `location.name` + `offices[]` (list); `questions` (per-job) | free text, per-board conventions | n/a — boards post per-country | all 6 known-bad postings identifiable |
| freehire | `countries`/`regions`, response-side AND request-side | ISO alpha-2 / macro buckets | `regions:["global"]`; empty = UNKNOWN not worldwide | 76% resolved; 24% ambiguous |
| Adzuna | URL path country | n/a | n/a | structural — cannot be wrong |
| Remotive | `candidate_required_location`, response-side | mixed free text | explicit `"Worldwide"` | 100% populated, needs alias table |
| HN | none | prose | n/a | not filterable |

---

## 1b. Can Greenhouse express it at all? — YES, definitively, three channels

**Channel 1 — `location.name`, on the list endpoint OAOS already fetches
(zero extra HTTP).** All four boards stamp the hiring country into it, each
with its own convention:

- grafanalabs: `"United States (Remote)"`, `"Spain (Remote)"`, `"Republic of Ireland (Remote)"` …
- clickhouse: `"United States (remote)"` (lowercase), bare `"United States"`, bare city `"San Francisco, CA"`, `"Toronto or Montreal"`, and `"India (remote)"` ×5
- chainguard: `"United States - Remote"`, multi-value `"Europe - Remote; United Kingdom - Remote; United States - Remote"`
- tailscale: `"Remote (United States)"`, `"Remote (Canada)"`, `"Hybrid (Denver, Colorado, United States)"`

**The six operator-verified ineligible postings, checked individually — every
one carries its restriction in this field:**

| posting | `location.name` | `offices[]` |
|---|---|---|
| Grafana Backend Eng – Platform Stacks (×4 live: IE/ES/SE/UK) | `"Republic of Ireland (Remote)"` / `"Spain (Remote)"` / `"Sweden (Remote)"` / `"United Kingdom (Remote)"` | `["EMEA"]` |
| Grafana SWE – Platform Productivity (×3 live: IE/ES/UK) | per-country | `["Ireland (Remote)","Spain (Remote)","UK (Remote)"]` — the full eligibility set, structured |
| ClickHouse Commercial AE | `"San Francisco, CA"` | `["United States"]` |
| ClickHouse Commercial AE – Canada | `"Toronto or Montreal"` | `["United States"]` (office field wrong-ish here; location.name decisive) |
| Chainguard Partner SE Tech Alliances | `"United States - Remote"` | `["Remote - US"]` |
| Tailscale Founding Solutions Eng (Singapore) | `"Remote (Singapore)"` | `["Remote (Singapore)/Singapore"]` |

**Channel 2 — `offices[]`**, populated 133/149, 167/167, 74/74, 56/56 across
the four boards. Sometimes coarser than location.name (Grafana `"EMEA"`), and
in the Platform Productivity case it enumerates the exact multi-country
eligibility set that the prose sentence states. In the ClickHouse Canada case
it disagrees with location.name (`United States` office on a Toronto role) —
location.name is the more specific signal; treat offices as corroboration.

**Channel 3 — application-form questions** (per-job endpoint,
`/v1/boards/{token}/jobs/{id}?questions=true`, +1 request per job). Verified
on Grafana 5999673004: a **required** dropdown reading verbatim *"Are you
located in Spain, UK, Sweden, Germany or Ireland?"*, plus work-authorization
and visa-sponsorship questions. The strongest possible signal, at a
per-posting HTTP cost the list endpoints don't have.

**Verdict: the company_board family is NOT structurally incompatible with the
operator's constraint.** These boards are remote-first companies posting
per-country requisitions; the country is board metadata, not buried prose.
Caveats, honestly: (i) `location.name` is free text with per-board formats —
a country extractor needs a small pattern set plus a country-name vocabulary,
and ClickHouse's bare-city values ("San Francisco, CA") need a city→country
assist or fall back to offices[]; (ii) this is measured on 4 boards, all
remote-first infra companies — a future board that stamps every posting
`"Remote"` with the restriction only in prose remains possible; the honest
posture is filter-on-field + treat unparseable-location as NOT eligible-
confirmed (surface, don't silently pass). (iii) metadata[] carries nothing
geo-useful (Chainguard: internal budget fields; Tailscale: Employment Type;
Grafana/ClickHouse: empty).

**Grafana's prose says "UK, Germany, Spain, Ireland and Sweden" but the UK
posting's location.name says only UK — is location.name under-informative?**
No: the role is posted as 4 sibling requisitions, one per country, each
correctly stamped. The full set is recoverable from the sibling group (or
Platform Productivity-style from offices[]). This is P3's regional-duplicate
mechanism seen from the geo side — Track 2's interaction question, previewed:
the same mechanism producing the duplicates also encodes the eligibility.

---

## 1c. Filter sites and costs

Ordered from source-side to sink-side. **The prompt's warning is CORRECT and
my analysis supports it** — stated per option below.

**Site A — source-level request params.** Only freehire (`countries=in`
plural) and Adzuna (path country, already inherent) can express geo in the
request. Cost: freehire's filter drops the 24% unresolved-geo slice (needs a
paired `regions=none`-style sweep to recover it, doubling requests) —
otherwise free. Himalayas' search endpoint has no location parameter that
Wave 5 found honored (limit/offset are ignored; a location param was not
probed — NOT OBSERVABLE without a dedicated probe). Greenhouse/Remotive/HN
have no request-side geo at all. Verdict: real but covers 2 of 6 sources.

**Site B — post-fetch, per-source structured-field mapping (new: normalize
the geo signal into RawItem/payload before prerank).** Each source adapter
lifts its OWN structured field (Himalayas `locationRestrictions`, Greenhouse
`location.name`+`offices`, freehire `countries`/`regions`, Remotive
`candidate_required_location`) into a common shape; a filter/gate consumes
the mapped value. This is field mapping, not content judgment — the same
class as the HN company lift, and per-source is the only honest way because
the vocabularies genuinely differ (English names vs ISO codes vs free text).
Cost: per-source mapping code + a shared country vocabulary; the decision
about what "not parseable" means (gate vs pass-with-flag) is an operator
ruling. This is where the real fix lives, in my assessment.

**Site C — prerank negative terms on country names. DO NOT.** The prompt's
warning is measurably right, and #23's data proves it: negative-term matching
is whole-text at depth 6. "available for candidates located in the UK,
Germany, Spain, Ireland and Sweden" — gating on `germany` would also gate a
worldwide-eligible posting that says "customers in Germany" or a company
"founded in Berlin". Worse than the seniority case on both axes: (i) country
names appear in body prose constantly for reasons unrelated to eligibility
(customer geography, office lists, legal boilerplate — Airbnb's US posting
mentions dozens of states); (ii) it is inverted logic — you'd need to gate
on ~190 countries EXCEPT India/worldwide, so a single missed alias passes an
ineligible posting and a single spurious mention kills an eligible one. The
seniority gate at least matched a term that usually IS the title. **This
analysis supports the prompt's warning without reservation.**

**Site D — prerank location gate extension.** The existing gate
(`prerank.ts:106`, `isOnsiteOnly`, FROZEN module) is a text-pattern
remote-vs-onsite test. Extending it to remote-from-where would inherit the
Site-C whole-text hazard (it tests `extractText(item)`) unless it were
changed to consume a structured mapped field — at which point it is Site B
wearing prerank's clothes, inside a frozen module. A new gate reason
(`geo_ineligible`) consuming a Site-B-mapped payload key is coherent but
touches frozen code; alternatively the filter runs in the orchestrator
between dedupe and prerank (no frozen files). Both variants specced in
Track 5.

**Site E — new scope dimension (the seniority precedent, D15 territory).**
Whatever mechanism filters, the operator's eligibility (India + worldwide-ok)
is SCOPE — it decides what discovery discards unseen, so under D15 it must be
operator-confirmed in preferences.json (schema v3), not hardcoded. Note geo
differs from seniority in kind: seniority terms gate on text; geo gates on a
per-source MAPPED field, so the persisted shape is eligibility countries +
an unresolved-policy flag, not a term list. Full spec in Track 5.

**Site F — post-pipeline (score-time or Airtable-side).** Rejected for
analysis' sake: every ineligible posting would still burn ~5 Gemini calls;
the 500 RPD budget is the binding resource. Filtering must happen before
`runPipeline` to matter.

---

## 1d. Structured field vs. reality — agreement audit (Himalayas)

Method: within the same API payloads (the `description` field IS the posting
body, full HTML ~5KB), regex-swept all 56 postings for geo-restricting prose;
19 matched; each checked against `locationRestrictions`. No click-throughs
needed except none — the payload carries the full text (this also stays
inside the probe budget).

- **Agreements: 17/19** — including exact matches ("must be based in the
  United States" / `["United States"]`; Bjak's per-country series; "must
  reside within the continental US" / `["United States"]`; "must be based in
  Korea" / `["South Korea"]`).
- **Hostaway (initially flagged, resolved as AGREEMENT):** prose "must be
  within EMEA"; field enumerates **148 countries**. Membership-checked: UK,
  Germany, Nigeria, UAE ∈ set; India, US, Brazil, Singapore ∉ set — the 148
  IS the EMEA enumeration. Consequence for any filter: **do not treat "long
  list" as "effectively worldwide"** — a 148-country list that excludes
  India excludes India. Membership test only, never length heuristics.
- **ConverseNow.ai (field-only information, not a disagreement):** field
  `["India"]`, description never mentions India at all (prose talks about
  Austin, TX). The structured field carries restriction the text doesn't —
  the case FOR trusting the field.
- **Confirmed disagreements: 0/19.**
- Cross-listing check: the Chainguard Greenhouse posting appears on
  Himalayas with the correct `["United States"]` restriction — aggregator
  extraction consistent with the origin board's own field.

**Agreement rate: 19/19 usable, 0 disagreements** (17 direct + Hostaway
resolved + ConverseNow field-only). Small sample; the field earns
provisional trust, revisit if a live run surfaces a counterexample.

---

## AMENDMENT A — full-board Greenhouse geo analysis (operator-requested)

**Cost: 0 additional requests** — the Track-1 board payloads already contain
all 446 postings with content. Budget granted (12) unspent.

### Population rate, per company

| board | jobs | `location.name` populated | `offices[]` populated |
|---|---|---|---|
| grafanalabs | 149 | **149/149 (100%)** | 133/149 (89%) |
| clickhouse | 167 | **167/167 (100%)** | 167/167 (100%) |
| chainguard | 74 | **74/74 (100%)** | 74/74 (100%) |
| tailscale | 56 | **56/56 (100%)** | 56/56 (100%) |

### Observed value vocabulary (complete census, not a sample)

- **grafanalabs (13 distinct values, perfectly regular):** always
  `"<Country> (Remote)"`. Countries: US, Spain, UK, Canada, Sweden,
  Republic of Ireland, Germany, Netherlands, France, Switzerland, Israel,
  **India (×2)**, Japan.
- **chainguard (13 distinct, regular):** always `"<Country> - Remote"`,
  including **multi-value semicolon-joined** ("Europe - Remote; United
  Kingdom - Remote; United States - Remote" ×3, two other combos). One
  region value ("Europe - Remote"). No India.
- **tailscale (7 distinct, regular):** `"Remote (<Country>)"` or
  `"Hybrid (<City>, <Province/State>, <Country>)"`. No India.
- **clickhouse (57 distinct — the messy outlier):** dominant form
  `"<Country> (remote)"` with case variants (`Remote`/`remote`), missing
  spaces (`"Singapore(Remote)"`, `"EMEA(Remote)"`), bare countries
  (`"United States"` ×13), bare cities (`"San Francisco, CA"`, `"Chicago"`,
  `"Boston"`, `"Tel Aviv"`, `"Bangalore"`, `"Amsterdam (remote)"`,
  `"Tokyo (Remote)"`, `"Melbourne"`), alternatives (`"Toronto or Montreal"`,
  `"Colombia or Argentina"`, `"Singapore or Australia (remote)"`), regions
  (`"EMEA (Remote)"` ×2, `"Europe (remote)"`), and exactly **one bare
  `"(Remote)"`**. **India appears 11×** ("India (remote)" 5, "India" 2,
  "India (Remote)" 2, "Bangalore" 1, plus 1 more variant).
- A country extractor over a name vocabulary (with aliases: UK, USA,
  "Republic of Ireland", "The Netherlands", "Mainland China") parses
  ~430/446 (~96%) directly; ~13 city-only values (ClickHouse) need a small
  city→country table; region values (EMEA/Europe) map to not-India; 1 value
  (`"(Remote)"`) is genuinely unparseable.

### The unrestricted/worldwide shape — effectively DOES NOT EXIST here

Across all 446 postings there is no "Worldwide"/"Anywhere"/"Global" value
and no empty field. The closest is ClickHouse's single bare `"(Remote)"`
(1/446). Company boards post per-country requisitions — companies hire
where they have legal entities, so "unrestricted" is not a case this family
produces in practice. Consequence: the Himalayas empty-array trap does NOT
transfer; the Greenhouse policy question is instead **what to do with the
~4% unparseable/city/region tail**. Recommendation carried into Track 5:
unparseable → NOT silently dropped — surfaced as `geo_unresolved` for the
operator (mirrors Q2's refuse-loudly philosophy). India measurement across
the four boards: **13/446 postings (2.9%) are India-eligible by field**
(Grafana 2, ClickHouse 11 incl. Bangalore, Chainguard 0, Tailscale 0).

### Field-vs-prose agreement (same method as 1d, decoded entity-escaped content)

289/446 postings contain restriction-style prose. Inspected in depth
(~35 spanning all four boards, every posting whose prose names countries):

- **Zero contradictions.** The per-country sibling pattern holds
  everywhere: prose states the full eligibility set ("candidates located in
  the UK, Germany, Spain, Ireland and Sweden"), each sibling requisition's
  `location.name` is one member of that set. Filtering on the field keeps
  exactly the variants the operator is eligible for — which for India is
  usually none, and correctly so.
- `offices[]` sometimes carries the FULL multi-country set structurally
  (ML Developer Advocacy: 7 offices listed on each of 7 siblings) — but is
  **occasionally stale per-sibling** (Grafana "Solutions Engineering NorBen"
  Sweden variant lists a Netherlands office; ClickHouse "Commercial AE -
  Canada" lists a US office). **`location.name` is the authoritative field;
  `offices[]` is corroboration/sibling-set evidence only.**
- `metadata[]` carries nothing geo-useful on any board (internal budget
  fields, employment type, or empty).

### questions=true — evidence, not a data source (per Amendment A ruling)

The per-job endpoint's required eligibility dropdown (verified once,
Grafana 5999673004) is the ground-truth channel, but costs 1 request per
posting (446/run baseline, ×2 under #16's healthCheck re-fetch — ~900
requests/run). Recorded in Track 5 as a **fallback verification mechanism
for individual postings only** (e.g. spot-auditing the field-based filter),
never the primary mechanism.

---

## Not observable in this track

- Whether Himalayas' search endpoint honors any geo request param (untested;
  response-side filtering doesn't need it).
- Himalayas false-negative rate on empty `locationRestrictions` beyond n=2.
- Whether non-activated Greenhouse boards (or Lever/Workday/Ashby) stamp
  location as reliably — Lever has structured `categories.location` +
  `workplaceType`, Ashby has `location`/`address` fields (*inferred* from
  Phase 0 records, not probed here).
- freehire's resolver precision (is `countries` ever WRONG, vs merely
  missing) — would need per-posting click-throughs; not spent.
