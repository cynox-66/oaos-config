# Experience-level eligibility — Step 0 probe

**Date:** 2026-08-07 · **Scope:** Himalayas only · **Requests:** 17 total
(15 initial probe + 2 containment) · **Gemini:** 0 · `preferences.json`
read-only.

**Status: CLOSED.** See the terminal decision immediately below.

Every claim below is tagged **MEASURED** (from a live probe or a captured
response this session) or **INFERENCE** (reasoning on top of a measurement).
Nothing here is a spec. The operator rules on mechanism first.

---

> ## ⛔ TERMINAL DECISION (2026-08-07, containment test) — READ FIRST
>
> **The experience-eligibility branch is CLOSED. No mechanism ships.**
>
> The containment test (§0) proved the `seniority=Entry-level` facet **does
> not filter the `q=` result set — it re-scopes the query**. Headline claim 2
> below, "reaches inventory the source cannot see," is **WITHDRAWN as
> unsupported**. It was inferred from zero guid overlap, which the test showed
> is equally consistent with re-scoping.
>
> With the request-side facet closed and response-side gating already ruled
> out (operator, on the strength of §Q1/§Q3), **there is no remaining
> mechanism**. Task 3 (faceted sweep) was NOT run — its premise was
> containment, and containment failed.
>
> The §4 yield finding stands and is unaffected by §0 (it was measured on the
> bare corpus and never depended on the facet) — but §4 **was itself corrected**
> for an unrelated record-matching error: **4 of 7 gate, not 5, and one
> survivor IS an engineering role.** See the correction banner in §4.
>
> **Task status:** Task 1 (containment) — done, closed. Task 2 (#28 bugfix +
> backfill) — done, closed, §2b. Task 3 (faceted sweep) — **not run**, premise
> failed. Nothing is left open.

---

## Headline

**Superseded in part — read the terminal decision above before acting on
any of this.** Preserved as written so the reasoning chain stays auditable.

1. **A request-side facet EXISTS: `seniority=Entry-level` on the search
   endpoint.** Isolated to that single param name. ✅ **Still true** — the
   param is honoured. What it *does* was misread; see §0.
2. ~~**The facet does not merely filter — it reaches inventory the current
   source structurally cannot see.**~~ ❌ **WITHDRAWN, §0.** The bare
   `q=kubernetes` top-20 did contain zero Entry-level items and the faceted
   call did return 20 with zero guid overlap — both **measurements** stand.
   The **inference** drawn from them does not.
3. **The response field `seniority` is present on 212/212 items and is NOT a
   statement of years.** ✅ **Still true**, and now doubly load-bearing: it is
   the reason response-side gating was ruled out, which with §0 leaves no
   mechanism at all.

And the yield answer the operator asked for, stated plainly: **at the ruled
threshold, the Himalayas passed 7 from 2026-08-06 reduces to 2, and neither of
the 2 is an engineering role.** §4. ✅ **Unaffected by §0.**

---

## §0 — Containment test (2026-08-07, requests 16–17) — **CONTAINMENT FAILS**

**Question:** is `seniority=Entry-level` a *filter* on the `q=` result set, or
does it *re-scope* the query? The first probe found zero guid overlap and
`totalCount` 31→23; both are consistent with either reading.

### Choosing a provably-complete control

The stated procedure was "find a term where bare `totalCount < 20`, so a
single response is the provably complete result set." **The ledger shows that
is not sufficient**: `devtools` returned `totalCount=6` but only **4** jobs,
and `networking` returned 19 of 636. Returned-count and `totalCount` disagree
even for small sets, so `totalCount < 20` alone does not prove completeness.

The stricter criterion is `totalCount == returned`. Exactly one sweep term
satisfies it: **`ebpf` (totalCount 1, jobs 1)**. That makes its bare match set
provably complete at N=1 — and it yields a decisive test, because a *filter*
over a 1-element set can only return that element or nothing.

### Result — MEASURED

```
REQUEST 16  GET /jobs/api/search?q=ebpf
→ 200  totalCount=1  jobs=1     ← totalCount == returned, PROVABLY COMPLETE
   ["Senior"]  eBPF Engineer - Remote @ Odigos
   guid: https://himalayas.app/companies/odigos/jobs/ebpf-engineer-remote

REQUEST 17  GET /jobs/api/search?q=ebpf&seniority=Entry-level
→ 200  totalCount=11  jobs=11   ← ALL 11 = ["Entry-level"]
```

| test | result |
|---|---|
| `|bare|` | 1 |
| `|faceted|` | 11 |
| intersection | **0** |
| **faceted ⊆ bare** | **FALSE** |
| guids in faceted not in bare | **11 of 11** |

### Three independent proofs of re-scoping

1. **`totalCount` INCREASED, 1 → 11.** A filter applied to a result set cannot
   produce more results than the set contains. This alone is conclusive.
2. **Intersection is 0**, and the bare set is provably complete. The single
   genuine eBPF posting — `eBPF Engineer - Remote` @ Odigos, labelled
   `["Senior"]` — is **absent** from the faceted response. A filter would
   return either that job or nothing.
3. **The faceted results are not eBPF postings.** 9 of 11 contain no `ebpf`
   substring anywhere in their description:

   | `ebpf` in description | title | company |
   |---|---|---|
   | no | Banco de Talentos – Próxima edição Programa de Estág… | Grupo Elfa |
   | no | BwB Fellows Programme | Bankers without Boundaries |
   | no | Working Capital Fund Financial Analyst (Operations) | BizFirst |
   | no | Banco de Talentos \| Korp | Korp ERP |
   | **yes** | Technical Support Engineer (L1/Frontline Support), E… | Databento |
   | no | Diplom-Finanzwirt (m/w/d) in Erftstadt | PMPG |
   | no | EPPM PS SAP Consultant – 5 Months contract | Müller's Solutions |
   | no | EPR specialist | Staxxer B.V. |
   | **yes** | Technical Support Engineer (L1/Frontline Support), A… | Databento |
   | no | Steuerfachangestellte \| Steuerfachwirte \| Bilanzbuch… | PMPG |
   | no | Payroll & Benefits Analyst | Bjak |

   A German tax clerk, a Brazilian internship talent pool and a payroll
   analyst are not members of the `q=ebpf` match set under any reading.

### Why `kubernetes` looked convincing and `ebpf` does not

**INFERENCE.** With `seniority=` present, `q=` appears to degrade to a loose or
largely-ignored match. For a common term like `kubernetes` there is enough
genuine entry-level Kubernetes inventory to fill a 20-slot page, so the result
*looked* on-topic (Kong, vCluster, Mirantis) and the re-scoping was invisible.
For a rare term like `ebpf` there is none, and the fallback content is exposed.
**This is why a rare term was the right control and a common one was not.**

This also retires NOT-OBSERVABLE #2. The implausible arithmetic flagged there —
faceted `kubernetes` implying 74% Entry-level against a corpus-wide 8.5% — was
the first symptom of re-scoping, correctly flagged as unresolved, now resolved.

### Decision — TERMINAL

**Containment fails. The facet is not a filter. "Unreachable inventory" is
unsupported and withdrawn. The request-side branch is CLOSED.**

Per the operator's ruling, response-side gating (on the `seniority` field or
on prose-extracted years) was already closed permanently. **No mechanism
remains, so no further work is warranted on experience-level eligibility for
Himalayas.** Task 3 was not run: containment was its stated precondition.

What survives from this probe is a **source-quality finding, not a mechanism**:
at the operator's threshold this source yields no actionable engineering roles
(§4), and its `seniority` field cannot express "unknown" (§Q1). Both are inputs
to the Q7 source-mix question, not to a filter.

---

## Q1 — Response-side field shape

**Corpus:** 13 live requests (one per enabled scope term) through the real
`createHimalayasSource` + the operator's confirmed v3 `preferences.json`.
212 unique guids. Raw bodies in `raw/sweep-*.json`.

### There is ONE field, not two — and it is not years

**MEASURED.** The search payload has exactly 20 keys per job:

```
applicationLink, categories, companyLogo, companyName, companySlug, currency,
description, employmentType, excerpt, expiryDate, guid, locationRestrictions,
maxSalary, minSalary, parentCategories, pubDate, salaryPeriod, seniority,
timezoneRestrictions, title
```

- `seniority` carries the experience LEVEL. **No key carries years minimum.**
  The only `exp`/`year` substring match across all 212 records is
  `expiryDate`.
- So of the two rows the rendered page shows, **only `Experience level:
  Mid-level` reaches the API.** `Experience: 5 years minimum` **does not.**
  Confirmed on the exact posting that prompted this probe: VEXXHOST
  "Kubernetes Engineer (English)" comes back as `seniority: ["Mid-level"]`
  with no years field anywhere, while its description prose reads
  *"…required qualifications 5+ years of hands-on experience with k…"*.

**INFERENCE.** The rendered "5 years minimum" row is derived by Himalayas
from the description at render time, or held in a store the search endpoint
does not project. Either way it is not available to us on this endpoint.

### Type, arity, null rate, vocabulary

**MEASURED**, N=212:

| property | value |
|---|---|
| type | `string[]` — always an array, never a scalar, never `null` |
| key present | **212/212 (100%)** |
| empty array `[]` | **0/212** |
| arity 1 | 211 |
| arity 2 | 1 (`["Senior","Manager"]`) |

Full observed value vocabulary — 6 values, closed in this sample:

| value | count | share |
|---|---|---|
| `Senior` | 120 | 56.6% |
| `Mid-level` | 54 | 25.5% |
| `Entry-level` | 18 | 8.5% |
| `Manager` | 11 | 5.2% |
| `Executive` | 6 | 2.8% |
| `Director` | 4 | 1.9% |

### What an unstated/entry-level posting looks like — the most important detail

**MEASURED: there is no "unstated" representation. The field is never absent,
never null, never empty.** Himalayas assigns a level to every posting.

**This is the exact inverse of the `locationRestrictions` convention.** There,
an empty array carries meaning the operator can trust (worldwide), and the
G1 geo work could rely on it. Here, a populated value does **not** distinguish:

- "the posting stated a requirement" from
- "Himalayas inferred a level from the title/prose"

**INFERENCE (well-supported, see Q3):** `seniority` is a Himalayas-derived
classification, not a publisher-stated field. A filter built on it would be
filtering on *someone else's judgment*, silently.

Two adjacent measurements worth recording:

- `employmentType` includes `"Intern"` (5/212), alongside `"Full Time"` (182)
  and `"Contractor"` (18). That is a *publisher-shaped* field and a cleaner
  signal than `seniority`, though it covers only the intern case.
- `parentCategories` is `[]` on 86/212 — noted only so a future reader does
  not mistake `seniority`'s 100% presence for a house style.

---

## Q2 — Request-side facet (the decisive question)

### The facet exists

**MEASURED — probe 14 (combined) then probe 15 (isolation).**

Baseline, from the same-day sweep (`raw/sweep-02-kubernetes.json`):

```
GET /jobs/api/search?q=kubernetes
→ 200  totalCount=31  jobs=20  limit=20  offset=0
   seniority mix of the 20 returned: Senior 13, Mid-level 7, Entry-level 0
```

Probe 14 — every plausible param name at once
(`seniority`, `seniorityLevel`, `experience`, `experienceLevel`, `level`,
`minYears`, `maxYears`):

```
→ 200  totalCount=23  jobs=20   ALL 20 = ["Entry-level"]
```

Probe 15 — `seniority` alone:

```
GET /jobs/api/search?q=kubernetes&seniority=Entry-level
→ 200  totalCount=23  jobs=20   ALL 20 = ["Entry-level"]
```

**The two response bodies are byte-identical (SHA-1 compared offline).**
`seniority=Entry-level` accounts for the entire effect; the other six names
contributed nothing. Value casing matches the response vocabulary exactly
(`Entry-level`, capital E, hyphen).

### `q=` is still applied — the facet intersects, it does not override

**MEASURED.** The 20 faceted results are on-topic for `kubernetes`: Kong
*Software Engineer – Kubernetes*, vCluster Labs *AI Infrastructure Engineer*,
Mirantis *AI Infrastructure & Platform Operations Engineer*, Logicalis
*Junior Engineer – CNI & Cloud Networking*, Canonical *Graduate Software
Engineer, Open Source and Linux*, Defense Unicorns *SkillBridge Intern –
Platform Engineer*.

**MEASURED:** guid overlap with the baseline top-20 is **0 of 20**. Expected —
the baseline's top-20 held no Entry-level items at all.

**MEASURED, and this is the yield argument:** the un-faceted query surfaces a
fixed top ~20 with **no pagination** (Wave 5, re-confirmed here: `limit`/
`offset` echoed back as 20/0 on all 13 sweep requests). Entry-level kubernetes
postings therefore exist in Himalayas' index but **cannot be reached by any
request the current source is capable of making.** The facet is not an
efficiency gain over a filter; it is access to a different slice.

**INFERENCE:** the same holds for the other 12 scope terms. **Only
`q=kubernetes` was probed** — generalization is untested (§5).

### Two contaminants in the faceted result, recorded not smoothed

**MEASURED.** The 20 faceted results also include *Sales Development
Representative* @ vCluster Labs and *Technical Specialist in Social &
Connected Care* @ Dedalus. The #25 GTM-vs-engineering condition is **not**
solved by this facet, and one duplicate pair appeared (*DevOps Engineer (AI
Inference)* @ Gcore twice, distinct guids).

---

## Q3 — Field-vs-prose agreement

The comparison that decides whether `seniority` is trustworthy as a
years-threshold filter. Prose minimums extracted offline by a **probe-local**
regex (four patterns: `N+ years`, `at least/minimum N years`, `N–M years`,
`N years of … experience`; capped at 25y). This extractor is not shipped code
and its precision is bounded — see §5.

**MEASURED**, N=212, cross-tabulated by label:

| `seniority` | n | prose states a min | unstated | observed min-years distribution |
|---|---|---|---|---|
| `Senior` | 119 | 76 | 43 | 2–12 (mode 5) |
| `Mid-level` | 54 | 24 | 30 | **1, 2, 3, 4, 5, 6, 7** |
| `Entry-level` | 18 | 3 | 15 | **2, 3, 3** |
| `Manager` | 10 | 4 | 6 | 1, 2, 5, 8 |
| `Executive` | 6 | 5 | 1 | 20 ×5 |
| `Director` | 4 | 2 | 2 | 5, 10 |
| `Senior,Manager` | 1 | 1 | 0 | 3 |

### Disagreement rate

Track 1d found **0/19** disagreements for `locationRestrictions`. This field
is not in that class.

**MEASURED — every `Entry-level` item whose prose states a minimum (3 of 18,
i.e. 17% of the labelled-entry population):**

| stated min | title | company |
|---|---|---|
| 2y | Junior JavaScript Developer | Sigma Software |
| 3y | Frontend Developer | Careerswift |
| 3y | Frontend Web Developer | Valerie Group |

**MEASURED — `Mid-level` items stating ≥5 years (the VEXXHOST class), 5 of
the 24 Mid-level items that state anything:**

| stated min | title | company |
|---|---|---|
| 5y | **Kubernetes Engineer (English)** | **VEXXHOST Inc.** |
| 7y | Future Openings – SRE Support Engineer – Observability | Virtasant |
| 7y | Business Development Manager, New Construction | LendingOne |
| 5y | Full Stack Engineer, Observability | LaunchDarkly |
| 6y | FRONTEND ENGINEER | Black Financial Consult |

**Verdict (MEASURED):** the label spans 1–7 years within `Mid-level` and 2–3
years within `Entry-level`. It does not encode a years threshold and cannot
be mapped onto one.

**INFERENCE:** as a *rank ordering* the label is directionally sane — Senior
skews high, Entry-level skews low, Executive is 20y. As a *gate* at the
operator's 1-year line it is wrong in both directions: it would admit
`Entry-level` postings demanding 3 years, and reject nothing on the strength
of a stated requirement.

**The asymmetry that matters for mechanism choice:** the same field is
trustworthy enough to *widen* a request (Q2 — "show me the entry-level
slice", where a false positive costs one prerank slot) and untrustworthy
enough to *delete* an item (a response-side gate, where a false positive is
an opportunity the operator never sees). Same field, opposite blast radius.

---

## Q4 — Yield at the operator's threshold

**Ruled threshold:** gate a stated minimum **above 1 year**; pass unstated.

Computed offline by `analyze.ts` replaying the 212 captured items through the
**real shipped modules** — real `normalize`, real geo mapper, real `prerank`,
real vocabulary from the confirmed v3 scope. Zero requests, zero Gemini.

### The composition

**MEASURED:**

```
[A] fetched 212 → experience-gated 112 (52.8%) → 100 survive
[B] geo:      212 → eligible 21, ineligible 187, unresolved 4 → 25 into prerank
[C] of the 25 geo-eligible → experience-gated 12 → 13 survive
[D] prerank:   25 → 10 passed, 15 gated (negative_term 14, location 1,
                                          below_floor 0, beyond_k 0)
[F] composed geo → seniority(prerank) → experience:
      10 passed → 6 gate on experience → 4 REMAIN
```

`maxPerRun` does not bind (`beyond_k: 0`) — the post-G1 regime recorded in the
G1 wave entry. **Every experience gate is therefore a directly visible loss,
not a reshuffle of a truncated tail.**

### The 2026-08-06 passed 7, named

The prompt asks specifically about the run that wrote records. Read back from
Airtable (`createdTime` 2026-08-06T18:29–18:35, `Source: himalayas`, 7
records) and matched to this session's capture for their prose:

> **⚠️ CORRECTED 2026-08-07.** The first version of this table mis-attributed
> record `recKGz1nTkyDoO29F` to **KDCI** (3y → GATE). It is **Talent Sam**
> (unstated → pass). Cause: the first pass matched records to payloads by
> *title text*, and the corpus holds two distinct `Front-End Developer`
> postings (KDCI and Talent Sam). The corrected table matches by **Source URL
> → guid**, which is exact. Totals and the conclusion changed; both are
> restated below.

Matched by Source URL → captured `guid` (exact, not title text):

| # | role | company | stated min | verdict | total score |
|---|---|---|---|---|---|
| 1 | Kubernetes Engineer (English) | VEXXHOST Inc. | **5y** | **GATE** | 55 (Tier B) |
| 2 | Back-End Developer (Job ID: 2266) | ConverseNow.ai | **3y** | **GATE** | 25 |
| 3 | Chief Data Officer (CDO) | TheHiveCareers | **20y** | **GATE** | 22 |
| 4 | Frontend Web Developer | Valerie Group | **3y** | **GATE** | 11 |
| 5 | **Front-End Developer** | **Talent Sam** | **unstated** | **pass** | 25 |
| 6 | Ambassadors – Worldwide | Uniplaces | unstated | pass | 12 |
| 7 | Evangelist | ComplexChaos | unstated | pass | 28 |

**MEASURED: 4 of 7 gate. 3 remain.**

**MEASURED.** Two of the three survivors are non-engineering: *Ambassadors –
Worldwide* is a student-ambassador promo role (1,609 chars, no years mention),
and *Evangelist* opens *"This is not a full time nor part time job — just the
potential to earn big if you deliver"* (3,766 chars, no years mention). Both
are #25-class items — they survive because they state nothing.

**The third survivor is a genuine engineering role.** Talent Sam's *Front-End
Developer* (1,701 chars) states no minimum anywhere and is labelled
`Mid-level`. It is the counter-example to the original claim.

**The corrected finding, stated plainly:** at the ruled threshold the
2026-08-06 Himalayas run yields **one** plausibly-actionable engineering role
out of 7 written records, not zero. The earlier "zero engineering roles"
statement was **wrong** and is withdrawn.

**What does not change:** the highest automated score OAOS has ever produced
(VEXXHOST, 55, Tier B) still gates on a 5-year minimum, as does the only
backend role. A 1-in-7 actionable rate is still a source-yield problem, and
the direction of the finding is unchanged — only its magnitude.

**What this does NOT license (per §0):** the original sentence continued "…and
§2 is why it is also not a dead end: the un-faceted query never asked for the
entry-level slice." That clause is **void** — §0 proved the facet does not
filter, so there is no "entry-level slice" to ask for by that mechanism.

### Composition on this session's fresh corpus

**MEASURED.** The 4 survivors of the 10 passed are *Ambassadors – Worldwide*
(Uniplaces), *Evangelist* (ComplexChaos), *Front-End Developer* (Talent Sam),
*Front End Developer* (TheHiveCareers) — all four verified to contain **no
year mention at all**. Same shape: zero engineering roles at a
recognizable company survive.

**MEASURED — seniority-label mix of the 25 geo-eligible items:** Senior 8,
Mid-level 9, Executive 3, Entry-level 2, Manager 2, Director 1. **Only 2 of
25 India-eligible items are labelled Entry-level.** The facet's potential
upside on this corpus is measured in the low single digits per term — but
across 13 terms, against a slice currently at zero.

---

## Q5 — Other sources

Answered from **existing captures only**. No Adzuna, Remotive, or Greenhouse
budget spent, per the prompt.

### Greenhouse — confirmed NO structured field

**MEASURED**, from `research/phase1-eligibility/raw/gh-{grafanalabs,clickhouse,
chainguard,tailscale}.json` (149 jobs on the Grafana board alone) plus
`gh-job-detail.json`:

Board keys: `absolute_url, ai_disclaimer, ai_opt_out_request_url,
application_deadline, company_name, content, data_compliance, departments,
first_published, id, include_ai_disclaimer, internal_job_id, language,
location, metadata, offices, requisition_id, title, updated_at`.

The only plausible carrier is `metadata`, and across all four boards it holds
exactly three names: `Careers Page Department`, `Budget Signed Offer Date
Quarter`, `Employment Type`. On the detail endpoint `metadata` is `null`.

**Confirmed: experience level lives in `content` prose only.** The prompt's
assumption holds, now measured rather than assumed.

### freehire — a response facet, request side UNPROBED

**MEASURED**, from `research/phase0/raw-freehire-facets.json`, at
`/data/facets/seniority`:

```json
{"c_level":51924, "intern":53532, "junior":83944, "lead":137217,
 "middle":48719, "principal":23897, "senior":303281, "staff":29196}
```

Eight values with corpus counts. `intern` (53,532) + `junior` (83,944) =
**137,476 postings**, ~19% of that corpus.

**MEASURED: this is a RESPONSE facet.** Whether `seniority=junior` is also
accepted as a *request* param is **not measured** — probing it would have
spent non-Himalayas budget the prompt excludes.

**INFERENCE (moderate confidence):** a search API that returns faceted counts
usually accepts the same facet as a filter. But freehire is precisely the
source where the singular/plural trap was found twice (`countries` filters,
`country` does not), so this must be probed, not assumed.

### Unanswered, by design

- **Adzuna** — not probed. Its 4-token collapse is already CONFIRMED
  0-results (G1 track4), so an experience token would compound a known
  failure.
- **Remotive** — not probed. 1 call/UTC day cap; the API has no query
  parameter at all, so a request-side facet is implausible on its face.
- **Lever / Workday / Ashby** — no captures in hand carrying this question.
  Not registered-and-activated today, so not on the critical path.

---

## 2 — Recommended mechanism

Three options. The cost/blast-radius asymmetry is unusually clean here.

### Option A — request-side facet (`seniority=Entry-level`)

- **Cost:** one param appended in `searchUrlFor`, downstream of
  `deriveQueryTerms` — the same seam A3's modifier already uses. Request
  count unchanged (13). `MAX_QUERY_TERMS`, one-page-per-query and
  drop-and-report all intact by construction.
- **Blast radius:** Himalayas only. Reversible by deleting one param. Nothing
  is deleted from a result set, so nothing can be silently lost — the failure
  mode is "fewer or different items came back", visible in the run summary.
- **Upside, MEASURED:** reaches a slice the current source structurally
  cannot see (§2). This is the only option that raises yield rather than
  lowering it.
- **Risk, MEASURED:** the facet is Himalayas' own classification, so it
  inherits Q3's unreliability — it will admit some 2–3 year "Entry-level"
  postings, and it will *exclude* genuinely-open postings that Himalayas
  labelled Mid-level. On the 25 geo-eligible items, only 2 are labelled
  Entry-level, so a facet-only strategy narrows the visible corpus sharply
  even as it widens the reachable one.
- **Risk, UNMEASURED:** generalization beyond `q=kubernetes` (§5).

### Option B — response-side filter on the `seniority` field

- **Cost:** a gate module plus a scope dimension.
- **Blast radius:** deletes items pre-scoring, unconditionally.
- **Verdict: do not build this.** Q3 measured the field disagreeing with prose
  in both directions. This is the "a field that is wrong is worse than no
  field" case stated in the prompt, and it is also the shape the seniority
  dimension's own ruling warns about — a negative, unconditional, pre-scoring
  gate whose worst case is silently deleting opportunities the operator never
  sees.

### Option C — response-side filter on prose-extracted years

- **Cost:** a years extractor over `description`, plus a scope dimension.
- **Blast radius:** widest. It gates on a regex reading of free text, and this
  probe measured that extractor being wrong in a way that mattered:
  ConverseNow's true minimum is 3 years ("3 - 5 years of experience in the
  development"), but a lowest-match heuristic reads "at least 1 years in
  Python or Golang" and returns 1 — flipping the item from GATE to pass.
- **Note (MEASURED):** at the *corpus* level the heuristic choice barely
  matters (112 / 114 / 115 of 212 gate under min / first-occurrence / max),
  but at the *item* level it flipped 1 of the 7 records that actually got
  written. Per-item correctness is what a gate needs.

### What I would pick

> **❌ SUPERSEDED BY §0.** Option A rested on the facet being a filter that
> reached otherwise-unreachable inventory. The containment test disproved
> that. **Option A is withdrawn. With B and C already closed by operator
> ruling, no option remains and nothing ships.** The paragraph below is kept
> only to show what the recommendation was and why it changed.

~~**Option A alone, as a probe extension — not as a shipped gate yet.**~~

Reasoning: Option A is the only one that *adds* reachable inventory, it is the
only one whose failure mode is visible rather than silent, and it is the only
one whose blast radius is a single URL parameter. Options B and C both delete
items on evidence this probe measured to be unreliable, in a regime
(`beyond_k: 0`) where every deletion is a direct loss.

**But the honest caveat, and it is load-bearing:** Option A was measured on
**one query term**. Before it ships, the same 13-term sweep should be re-run
with `&seniority=Entry-level` and the two corpora diffed — that is one probe
session of 13 requests, and it answers "does this generalize" and "what does
the geo-eligible set look like when we ask for entry-level" in one pass.
**That is the next step I would propose, and it is a probe, not a build.**

I would also note for that session: a facet-only strategy *replaces* the
current corpus rather than extending it. Whether Himalayas should issue 13
faceted requests, 13 bare ones, or 26 of both is a request-budget question
this probe did not measure and should not pre-decide.

---

## 3 — Is A3/Q6 superseded?

> **❌ REVERSED BY §0. The answer is NO.** The supersession argument required
> the facet to be a working filter. It is not one — it re-scopes the query and
> discards the `q=` match set (§0). **A3 is not superseded by anything
> measured here; it is simply untouched.** Its own status is unchanged: still
> `enabled: false`, its Adzuna arm still measured dead (0-results, G1 track4),
> its freehire arm still unprobed. Nothing in this probe is a reason to enable
> or remove it. The table below is retained to show the reasoning that failed.

~~**Yes, for Himalayas — measured, not argued.**~~

A3 appends `entry level` to the query STRING (`<term> entry level`). What was
measured here is a real server-side facet on a structured field. The facet is
strictly better on every axis this probe touched:

| | A3 string modifier | `seniority=` facet |
|---|---|---|
| mechanism | dilutes the relevance query with 2 tokens | structured filter, `q` preserved intact |
| measured effect | Himalayas 227→189 fetched (83% retained), marginal-on-top-of-A1 only | 20/20 Entry-level, `q` still applied, 0 overlap with bare top-20 |
| reaches unpaginated inventory | no — same ranked top-20 | **yes** |
| collapse risk | CONFIRMED 0-results on Adzuna's 4-token form | none observed |

**Scoped claim:** superseded **for Himalayas**. A3 is a cross-source mechanism
(himalayas / freehire / adzuna). Its Adzuna arm is already measured dead
(0-results, G1 track4). Its freehire arm may be supersedable the same way if
freehire's `seniority` facet is request-accepted — **unprobed** (Q5).

**Recommendation:** do not enable A3 for Himalayas. Whether A3 survives at all
depends on the freehire probe, not on anything measured here.

---

## 4 — NOT OBSERVABLE

| # | What is not settled | Exactly what would settle it |
|---|---|---|
| 1 | ~~Does the facet generalize past `q=kubernetes`?~~ **MOOT (§0)** — the facet is not a filter, so generalization is not worth measuring. | — |
| 2 | ~~`totalCount` semantics.~~ **RESOLVED (§0).** The implausible 74% was the first symptom of re-scoping. `totalCount` rose 1→11 on `ebpf`, proving it is not an intersection count. | — |
| 3 | ~~Does the facet accept multiple values?~~ **MOOT (§0)** — no filter, nothing to widen. | — |
| 4 | **Is `seniority` publisher-supplied or Himalayas-derived?** Q3 makes derived the strong inference; not proven. | Not settleable from this API. Would need a posting whose ATS source is independently visible (e.g. one also on a registered Greenhouse board) and a comparison. |
| 5 | **freehire `seniority` as a REQUEST param.** Response facet measured; request side unprobed. | `GET /api/v1/jobs/search?q=&seniority=junior` + a bare control, compare `total`. **2 requests, freehire budget.** |
| 6 | **Where the rendered "5 years minimum" row comes from.** Not in the search payload. | Check for a per-job detail API endpoint, or a `__NEXT_DATA__` payload on the rendered page. **1–2 requests.** |
| 7 | **Prose-extraction precision.** The probe-local regex was measured wrong on ConverseNow (read 1y, true 3y). Its true precision/recall is unknown. | Hand-label a sample of ~30 descriptions and score the extractor. **0 requests, offline.** |
| 8 | **Whether the composed filter changes prerank ranking**, not just membership. IDF is defined over the batch, so removing 112 of 212 items shifts every score. `analyze.ts` gates *after* prerank; it does not re-run prerank on the survivors. | Re-run `prerank` on the experience-surviving set and diff the passed order. **0 requests, offline.** |

---

## 5 — Probe ledger

**15 live requests, all Himalayas, all HTTP 200. Zero Gemini. Zero Airtable
writes. Zero files changed in `src/`, `cli/`, or any test.**

| # | request | result |
|---|---|---|
| 1 | `search?q=cloud-native` | 200, totalCount 24, 18 jobs, 120,465 B |
| 2 | `search?q=kubernetes` | 200, totalCount 31, 20 jobs, 116,939 B |
| 3 | `search?q=security` | 200, totalCount 506, 20 jobs, 145,782 B |
| 4 | `search?q=ebpf` | 200, totalCount 1, 1 job, 3,177 B |
| 5 | `search?q=chaos-engineering` | 200, totalCount 59, 20 jobs, 159,628 B |
| 6 | `search?q=networking` | 200, totalCount 636, 19 jobs, 110,882 B |
| 7 | `search?q=devtools` | 200, totalCount 6, 4 jobs, 28,856 B |
| 8 | `search?q=infra` | 200, totalCount 35, 20 jobs, 146,279 B |
| 9 | `search?q=observability` | 200, totalCount 29, 18 jobs, 120,275 B |
| 10 | `search?q=web%2Ffrontend` | 200, totalCount 667, 17 jobs, 82,215 B |
| 11 | `search?q=backend` | 200, totalCount 682, 20 jobs, 107,806 B |
| 12 | `search?q=data` | 200, totalCount 171, 17 jobs, 97,124 B |
| 13 | `search?q=ai%2Fml` | 200, totalCount 374, 19 jobs, 127,440 B |
| 14 | `search?q=kubernetes` + 7 candidate facet params | 200, totalCount 23, 20 jobs, **all Entry-level** |
| 15 | `search?q=kubernetes&seniority=Entry-level` | 200, totalCount 23, 20 jobs, **byte-identical to #14** |
| 16 | `search?q=ebpf` (containment control) | 200, **totalCount 1, jobs 1** — provably complete; the 1 job is `["Senior"]` |
| 17 | `search?q=ebpf&seniority=Entry-level` | 200, **totalCount 11, jobs 11**, intersection with #16 = **0** → **containment FAILS** |

Requests 1–13 fetched 212 unique guids (post within-source dedupe), 0 errors.
`limit`/`offset` echoed 20/0 on all 13 — Wave 5's no-pagination finding
re-confirmed.

### Artifacts (all in `research/experience-eligibility/`, UNTRACKED)

| file | what it is | cost to re-run |
|---|---|---|
| `capture.ts` | 13-request sweep through the real shipped source, recording `httpGet` wrapper | 13 requests |
| `probe-facet.ts` | Q2 facet probe; takes a URL argv so #15 reused it | 1 request each |
| `analyze.ts` | Q4 offline replay through real normalize/geo/prerank | **0 requests** |
| `raw/sweep-01..13-*.json` | the 13 response bodies verbatim | — |
| `raw/facet-combined.json`, `raw/facet-isolate-seniority.json` | probes 14 & 15 verbatim | — |
| `ledger.json` | machine-readable request ledger with timestamps | — |

All three scripts are excluded from `vitest run` by filename (no
`.test.`/`.spec.`), the standing convention from `live-verify*.ts` /
`verify-seniority.ts` / `verify-g1-replay.ts`.

## §2b — known-issues #28: FIXED AND BACKFILLED (2026-08-07) — **CLOSED**

Run as a bugfix alongside the containment test, independent of its outcome.

### Cause — MEASURED

`src/engines/normalization/adapters/job_board.ts` read company from
`["company", "company_name", "organization", "employer"]`, and `readString`
(`adapters/shared.ts`) matches keys **exactly** — no case-insensitive or
camelCase fallback. Himalayas publishes **`companyName`**, present on
**212/212** captured records. Nothing matched, so `company` was `null` → `""`.

### Why it mattered more than a blank column

`computeFingerprint` is `sha1(normalizeCompany(company) | normalizeRole(role) |
host(url))`. With company `""` and a single host (`himalayas.app` on 227/227
items), **every employer sharing a role title collapsed to one fingerprint**
before anything was written — silent, unauditable loss, exactly as #28 records.

### Fix — minimal

One key added to the existing list, with a comment naming the issue. **No
refactor, no new dependency, no adjacent change.**

```diff
   company: readString(payload, [
     "company",
     "company_name",
+    "companyName",
     "organization",
     "employer",
   ]),
```

### Regression tests — 3 added

`src/engines/normalization/tests/normalize.test.ts`, new describe block
`himalayas company mapping (known-issues #28)`:

1. company reads from `companyName` and is non-empty for a himalayas record
   *(the assertion asked for)*;
2. **two employers sharing a role title do not collapse to one fingerprint**
   — the actual harm, and the assertion that would have caught this;
3. snake_case `company_name` still resolves — guards the other boards.

Suite: **1123 passed / 83 files**, up from 1120/83. No pre-existing test
changed.

**On fixture skepticism (#21):** test 1 alone is the weak form — a fixture
written from a misreading of the payload encodes the misreading and passes.
Test 2 is the strong form: it asserts the *invariant* (distinct employers ⇒
distinct fingerprints) rather than a field mapping, so it fails for any future
source whose company key is missed, not only for `companyName`.

### Migration — the part #28 warned about

#28: *"Anyone who 'just adds the key' ships a second defect on top of the
first."* The fix re-fingerprints the 7 written records; leaving their stored
fingerprints stale would make the next run miss them and **create 7
duplicates**. So the backfill wrote **`Company` AND `Fingerprint` together**.

**Safety gate — the reconstruction was verified before any write.**
`backfill-28.ts` re-ran the *same real* `normalize()` on each captured payload
with `companyName` deleted, and required the result to reproduce the **stored**
fingerprint byte-for-byte. **All 7 reproduced exactly** (and all 7 yielded
`company === ""`), proving the reconstruction matches what the 2026-08-06 run
actually did. The script refuses to write on any mismatch.

| record | company backfilled | fingerprint |
|---|---|---|
| `recok6rs6BksDShBP` | VEXXHOST Inc. | `fe365b31…` → `20120bc7…` |
| `recQTlbmBkWl91eXK` | ConverseNow.ai | `a050b2c1…` → `2d99738e…` |
| `recQ9bAB50p5svota` | Uniplaces | `cde213e7…` → `354eeeb6…` |
| `rec2mHDepkLbXWprm` | ComplexChaos | `71f342e8…` → `362d0309…` |
| `recJic71MBJfSY4oS` | TheHiveCareers | `eff32a73…` → `4f502af3…` |
| `recKGz1nTkyDoO29F` | Talent Sam | `dccd53bc…` → `21c1b54b…` |
| `recIrdMaO27ayNQtG` | Valerie Group | `2a7f564b…` → `48d9b52b…` |

**7 of 7 fingerprints changed** — confirming the collapse risk was real and
that a key-only fix would have duplicated every record.

**Verified by read-back:** all 7 now carry a non-empty `Company` and a full
40-character fingerprint.

*Process note, recorded rather than smoothed:* the first PATCH attempt wrote an
**8-character truncated** fingerprint to `recok6rs6BksDShBP`, because the
dry-run table printed abbreviated hashes and those were copied. Caught
immediately on the response and overwritten in the same corrective PATCH that
wrote the other six. Final read-back confirms all 7 at 40 chars. Had it gone
unnoticed, that record would have duplicated on the next run — the very failure
the migration existed to prevent.

### Decision — TERMINAL

**#28 is CLOSED.** Cause found, minimal fix shipped, invariant-level regression
test added, all 7 records backfilled and verified. `docs/known-issues.md` #28
can be marked resolved; it was top of the defect queue and no longer blocks
Himalayas record interpretation.

**Not done, deliberately (out of scope):** no other camelCase key was added
speculatively — `role` already resolves via `title`, and no other blank field
was measured on these records. If another source is activated, the activation
protocol's post-run field-completeness check is the mechanism that catches its
equivalent, not a speculative key list.

---

### Incidental confirmation of known-issues #28 *(original probe note, now resolved — see §2b)*

**MEASURED.** All 7 Himalayas records read back from Airtable have an **empty
`Company` field**, while every `greenhouse:*` record has one populated. #28
reproduces exactly as documented. Not acted on — out of scope for this probe.

---

**PAUSED at the deliverable, as instructed.** No spec, no build, no commit.
The operator rules on mechanism (§2) before anything else proceeds; the
13-request generalization sweep in NOT-OBSERVABLE #1 is the step I would
propose next if Option A is the direction.
