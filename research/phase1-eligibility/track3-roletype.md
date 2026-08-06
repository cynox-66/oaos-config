# Track 3 — Role type / GTM contamination (#25)

**Date:** 2026-08-06. **Probe requests: 0** (offline replay + one read-only
Airtable list call, which is persistence access, not a discovery probe).
Measured via `replay-analysis.ts` / `term-counts.ts` over the real 2026-08-06
corpus (identity verified — replay reproduces 446/324/25 exactly).

## 3a. Why sales roles score well in prerank — quantified

Prerank score = IDF-weighted **presence** overlap (#20). Measured matched-term
counts against the operator's live vocabulary (13 enabled fields + default
role terms):

**The five GTM roles in the passed 25:**

| role | terms matched | matched vocabulary |
|---|---|---|
| Chainguard Partner SE Technology Alliances | **11** | cloud-native, kubernetes, security, observability, data, engineer, engineering, developer, platform, software, architect |
| ClickHouse Commercial AE (SF) | 10 | observability, data, engineer, engineering, developer, platform, infrastructure, software, architect, contract |
| ClickHouse Commercial AE – Canada | 10 | same 10 |
| Tailscale Founding Solutions Engineer (Singapore) | 8 | security, data, engineer, engineering, developer, platform, systems, software (approx. — 8 measured) |
| Chainguard Field Marketing Manager – CEUR | 7 | cloud-native, security, data, developer, devops, platform, software |

**Genuine engineering roles in the same passed set: 8–15 terms** (Chainguard
SWE Libraries Platform 15, Staff AI Engineer 15, Backend Platform Stacks 12,
Cloud Security Engineer 10, Mobile Platform Developer 9, PM Tailscale-Native
Apps 8). **The ranges overlap completely.** A Partner SE posting at a
Kubernetes-security company mentions Kubernetes, cloud-native, and security
once each — and presence-based matching cannot distinguish "requires
Kubernetes engineering" from "sells Kubernetes products". The gated GTM tail
shows the same shape at lower counts (AE roles 5–7 terms: observability,
data, platform, infrastructure, systems — pure company-boilerplate matches).

There is **no discriminating term**: every term the vocabulary could gain
from the operator's evidence appears in GTM postings at these companies,
because the companies' products ARE the operator's domains. This is why #25
is structural, not a tuning gap.

## 3b. Is this prerank-only, or also scoring? — ANSWERED from persisted data: ALSO SCORING

Read-only Airtable query, 53 records, 2026-08-06 state. The five GTM roles
were written by the 2026-08-06 run with real Gemini scores:

| role | Q | M | T | Tier | table position |
|---|---|---|---|---|---|
| Chainguard Partner SE Technology Alliances | 40 | 20 | **60** | **B** | **#2 of 53** — the highest-scoring automated record ever, above every engineering role except manual-intake AccuKnox (77) |
| Tailscale Founding Solutions Engineer (Singapore) | 33 | 14 | 47 | C | mid-table, above ~30 engineering records |
| Chainguard Field Marketing Manager – CEUR | 32 | 5 | 37 | C | lower-mid; Match caught it (5), Quality did not (32) |
| ClickHouse Commercial AE | 28 | 5 | 33 | C | near-bottom |
| ClickHouse Commercial AE – Canada | 28 | 5 | 33 | C | near-bottom |

**Verdict: #25 is NOT cosmetic — it is a two-tier problem.**
- **Pure sales/marketing (AE, Field Marketing):** Engine 2's Match axis
  correctly bottoms them out (M5). Quality stays mid (28–32) because Quality
  measures the company/opportunity, not fit — defensible. These are
  cosmetic-ish: low Total, Tier C, would never be actioned.
- **Sales-engineering hybrids (Partner SE, Solutions Engineer):** Gemini
  does NOT catch them. The Partner SE posting legitimately demands
  Kubernetes/Python/Go/AWS/DevSecOps skills — the operator's literal
  evidence vocabulary — so Match scores it 20/50, higher than any genuine
  engineering role in the table. **The result is inverted ranking:** the
  table's top automated record is a US-only, 5+-years, sales-quota role the
  operator cannot hold, while eligible-in-principle engineering roles sit
  below it.

Note the compounding: the #2 record fails on BOTH axes this session
investigates (geo: US-only; role type: sales engineering) — neither failure
is visible in any persisted field.

## 3c. Options

The prompt's lexical-difficulty warning is confirmed by 3a: "Solutions
Engineer" contains "Engineer"; `sales` as a negative term would gate any
posting mentioning a sales team (whole-text, #23's mechanism). Options,
honestly assessed:

**R1 — Do nothing at prerank; rely on Engine 2 + operator eyeball.**
Evidence for: pure sales already bottoms out. Evidence against: the
sales-engineering tier reaches #2 in the table; at 25-slot budgets every GTM
slot displaces an engineering role (5/25 slots in the current control ≈ 20%
of the Gemini budget spent on unusable roles).

**R2 — Title-scoped negative gate on role-type terms** ("account executive",
"marketing", "sales development", "solutions engineer", "partner se", …).
This is the durable fix named in #23 (title-scoped, not whole-text), and
role TITLES are far more regular than geo prose — "Account Executive",
"Marketing Manager" are unambiguous in a title in a way country names in a
body are not. Costs: prerank is FROZEN (needs operator ruling + a
title-extraction seam prerank currently lacks — it sees only joined text;
the title would have to arrive as a separate field, which is a prerank
interface change); a closed exclusion list is D15 territory (unreviewed
exclusions delete unseen — same ruling as seniority, so it wants the same
scope-dimension treatment: persisted, operator-confirmed, closed set).
Consciously imperfect: "Solutions Architect" at ClickHouse India is
GTM-adjacent but was one of only 2 India-eligible near-engineering roles —
a title gate must be curated by the operator, not inferred.

**R3 — Positive title requirement** (pass only titles matching engineering
patterns). Rejected in analysis: inverts the under-propose principle —
a miss deletes a genuine novel-titled engineering role unseen; the operator
cannot enumerate all engineering titles safely.

**R4 — Score-side rubric change.** Out of scope by standing rule (report,
don't tune) and the wrong layer: Match 20 for Partner SE is *honest* about
skill overlap; the problem is role-type eligibility, which is a gate
question, not a fit question.

**My assessment (operator rules):** R2 as a seniority-style scope dimension
is the only durable option, sequenced AFTER geo — because geo filtering
already removes 4 of today's 5 GTM offenders (all non-India), and the
residual India-eligible GTM contamination observed today is 3 items
(Solutions Architect ×2, Enterprise AE Mumbai). Measure the residual after
geo lands before paying R2's frozen-module cost. Full spec in Track 5.
