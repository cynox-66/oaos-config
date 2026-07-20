# Phase 0 — Discovery Source Live Probes — SUMMARY

**Scope:** Research only. No OAOS `src/`, `cli/`, or `scripts/` code touched.
Three live-probe rounds against official/public APIs: freehire.dev (Step 1),
Greenhouse/Lever/Workday CXS for a 21-company target list (Step 2), and a
targeted re-probe adding Ashby + a supplied Red Hat Workday URL + token
variants on the India-focused misses (Step 2b, final Phase 0 step).

**Total HTTP requests: 118** (45 in Step 1, 34 in Step 2, 38 in Step 2b's
own hard-capped 40-request budget + 1 ad-hoc verification call). Step 2b
ran under its own fresh 40-request cap (per that step's instructions) and
stayed under it (39/40 used). Steps 1+2 together exceeded the original
"~60 for the whole session" guidance, as already flagged after Step 2 —
that stands; nothing new to add except that Step 2b's separate budget was
respected as its own allowance, not stacked onto the original 60.

---

## Step 1 — freehire.dev depth (full detail: `freehire-findings.md`)

- **Verdict: YES**, deep enough to serve as the primary **worldwide**
  remote net for infra/backend/SRE/devops/security categories — every
  one of 6 test queries returned 4-to-5-figure result counts, 90% of
  sampled postings had real descriptions.
- **Correction to Decision Doc §1.2:** the documented `region`/`country`
  (singular) query params don't filter anything when called directly —
  confirmed live (`region=apac` == no region param, byte-identical). The
  real params are `regions`/`countries` (plural). Any OAOS client hitting
  the raw API must use the plural form.
- **Correction to Decision Doc §1.2:** "only source with structured
  salary" doesn't hold *for these categories* — 0/600 sampled postings
  had a structured salary field (staffing-agency reposts dominate these
  queries and only put salary in free text). The field exists corpus-wide
  (~277k/3.5M postings via the `salary_period` facet) — it's a category
  effect, not a broken/absent field.
- **Decision Doc §3.4 Q1 answered:** India-tagged remote postings
  (`countries=in`) average **3.4%** of each query's total. Real but thin.
  freehire is a worldwide/US-EU-heavy backbone, not an India-specific net.

## Step 2 — ATS platform detection (full detail: `ats-findings.md`)

21 companies parsed from `target-companies.txt`; 2 skipped (Amazon Web
Services, IBM — no company-wide careers URL, team-specific hiring by
design, not reachable via a board watcher). Of the 19 remaining, 2 had no
career-page evidence to try (n/a — same 2 as above), leaving **17 probed**
with **one derived token each** (lowercase-no-punctuation company name —
none of the 21 source URLs happened to expose an ATS-hosted domain
pattern like `boards.greenhouse.io/<token>` directly, so name-derivation
was used for all of them).

**Confirmed hits (6/17 = 35%):**

| Company | Tier | Platform | Token | Live postings | Remote-matching |
|---|---|---|---|---|---|
| Grafana Labs | Tier 2 | Greenhouse | `grafanalabs` | 114 | 114 |
| ClickHouse | Tier 2 | Greenhouse | `clickhouse` | 173 | 127 |
| Chainguard | Tier 3 | Greenhouse | `chainguard` | 80 | 80 |
| Tailscale | Tier 3 | Greenhouse | `tailscale` | 38 | 33 |
| Teleport | Tier 3 | Lever | `teleport` | 0 | 0 |
| Sysdig | Tier 3 | Lever | `sysdig` | 5 | 4 |

**No hit (11/17 = 65%):** AccuKnox, Red Hat, DSR Corporation, MarketAxess,
SigNoz, Last9, Civo, One2N, Appsmith, Loft Labs, Solo.io, LocalStack,
Swirlds Labs.

**Important limitation — read before treating "none" as "confirmed
absent":** this probe tried exactly **one** derived token per company
(per Step 2's scope lock: "Derive `<token>` ... else from a lowercase
no-punctuation company name" — singular, not the 1-3-candidate approach
from the original Phase 0 brief). A 65% miss rate on a single guess is
expected, not a verdict that these companies aren't on Greenhouse/Lever —
it means this specific token guess didn't match. Known specific gaps:

- **Red Hat** is very likely on **Workday** (flagged in the source file's
  own comment: "Medium — Workday, rigid enterprise pipeline") but Step 2's
  scope lock explicitly forbids brute-forcing Workday tenants without a
  `myworkdayjobs.com` URL, and none was supplied for Red Hat. **Action:**
  if you can supply Red Hat's actual `*.myworkdayjobs.com` careers URL,
  a follow-up single-tenant check is a 1-request addition.
- **SigNoz** is documented (source file comment) as using **Ashby**, which
  this probe deliberately doesn't check (out of scope — official APIs
  list was Greenhouse/Lever/Workday only). Correctly shows "none" here;
  that's expected, not a miss.
- The other 9 "none" companies (AccuKnox, DSR Corporation, MarketAxess,
  Last9, Civo, One2N, Appsmith, Loft Labs, Solo.io, LocalStack, Swirlds
  Labs) are genuinely undetermined — could be in-house ATS, a differently
  spelled token (e.g. a legal-entity name vs. brand name), or a platform
  outside this probe's scope. Worth a manual look at their actual careers
  pages before concluding "not viable," especially AccuKnox and DSR
  Corporation given they're Tier 1.

**Teleport note:** the Lever hit returned 0 live postings — the token
matched a real (200 OK) board, but it's currently empty or the wrong
board. Worth a manual spot-check before relying on it.

---

## Step 2b — targeted re-probe (full detail: `ats-findings.md` § Step 2b)

Final Phase 0 step. Four tasks under a fresh 40-request cap: (1) Ashby
checks for SigNoz/Chainguard/Loft Labs/Swirlds Labs/Teleport, (2) 2-3
token-variant retries on Greenhouse+Lever for the 7 India-focused misses,
(3) a real Red Hat Workday tenant check using an operator-supplied URL,
(4) a Teleport Lever/Ashby cross-check. 38/40 requests used by the script
+ 1 ad-hoc verification call (39 total) — did not hit the hard cap.

**New confirmed hits:**

- **Red Hat — Workday (`redhat.wd5.myworkdayjobs.com`, tenant `redhat`,
  site `Jobs`): 228 live postings, 19 matching `searchText="remote india"`.**
  This flips Red Hat from "deferred, no URL" to a confirmed, strong Phase 1
  source once a real tenant URL was supplied — the Step 2 gap closed
  exactly as flagged.
- **SigNoz — Ashby (`signoz`): 12 live postings, 7 remote-matching.**
  Confirms the source file's own comment ("High — Ashby, actively recruits
  India") — this is the single India-focused hit across all of Phase 0.
- **Swirlds Labs — Ashby (`hashgraph`, not the obvious `swirldslabs`
  token): 2 live postings, 2 remote-matching.** Low volume but real.

**Resolved ambiguity — Teleport:** confirmed dead for now. Lever board is
real (200 OK) but 0 current postings; Ashby has no board under `teleport`
at all (404). Not a stale-token situation — Teleport currently isn't
advertising via either mechanism this probe can see. Drop from the
locked list; don't build a watcher for 0 postings.

**Unresolved ambiguity — Loft Labs:** Ashby token `loft` returns 200 OK
but an empty job list with no organization-identifying field in the
response — cannot confirm this board actually belongs to Loft Labs (it's
a generic word, plausible false-positive) and it has 0 postings regardless.
Do not lock into Phase 1 without a manual check of loft.sh's actual
careers page.

**Still no hit after variant retries:** AccuKnox, Last9, Civo, One2N,
Appsmith, Solo.io, LocalStack — all tried 1-2 additional token variants
each against both Greenhouse and Lever, all still "none." This raises
confidence (though doesn't prove) that these companies genuinely aren't
on Greenhouse/Lever under any obvious token — consistent with the original
task brief's own expectation that AccuKnox and DSR Corporation likely use
other platforms entirely (Zoho Recruit / Applytojob, per that brief).

---

## FINAL — locked Phase 1 watcher list

| Company | Platform | Token / tenant | Live postings | Remote-matching | Confidence |
|---|---|---|---|---|---|
| Grafana Labs | Greenhouse | `grafanalabs` | 114 | 114 | High |
| ClickHouse | Greenhouse | `clickhouse` | 173 | 127 | High |
| Chainguard | Greenhouse | `chainguard` | 80 | 80 | High |
| Tailscale | Greenhouse | `tailscale` | 38 | 33 | High |
| Sysdig | Lever | `sysdig` | 5 | 4 | High |
| Red Hat | Workday CXS | tenant `redhat`, site `Jobs` | 228 (19 remote-india) | — | High |
| SigNoz | Ashby | `signoz` | 12 | 7 | High — only India-focused hit |
| Swirlds Labs | Ashby | `hashgraph` | 2 | 2 | High, low volume |

8 companies, 4 platform families, 652 total live postings visible across
them (excluding Red Hat's remote-india subset, already inside its 228).

**Companies remaining uncovered by any watcher — stay on Stage 1/2 manual
coverage:**

- **AccuKnox** — likely Zoho Recruit per the source brief's own hint;
  not checked this session (out of the Greenhouse/Lever/Workday/Ashby
  scope covered here). Tier 1, high manual-outreach priority.
- **DSR Corporation** — likely Applytojob per the source brief's own
  hint; same as above, not checked, Tier 1 manual priority.
- **Amazon Web Services** — no company-wide careers URL, internal/team
  ATS, out of scope by design.
- **IBM** — same, no company-wide careers URL, huge org.
- **MarketAxess** — checked (name-derived token), no hit; not re-probed
  in Step 2b (wasn't flagged India-relevant).
- **Last9, Civo, One2N, Appsmith, Solo.io, LocalStack** — re-probed with
  variants in Step 2b, still no hit on Greenhouse/Lever. Not checked
  against Ashby (out of Step 2b's task list for these 6) — worth a quick
  Ashby check in a future pass before fully writing off, given SigNoz's
  and Swirlds Labs' Ashby hits show that platform matters for this
  company set.
- **Loft Labs** — Ashby token exists but is unverified and empty; treat
  as uncovered until manually confirmed.
- **Teleport** — mechanically "coverable" via Lever but currently 0
  postings on both Lever and Ashby; not worth building a watcher for
  right now.

## Combined verdict — final recommended source priority for Phase 1

1. **Greenhouse company-board watcher — build first.** 4 confirmed
   companies (Grafana Labs, ClickHouse, Chainguard, Tailscale), 405
   combined live postings, official zero-cost API. Highest-confidence,
   lowest-risk Phase 1 candidate — matches Decision Doc D1.
2. **Workday CXS — build second, not deferred anymore.** Red Hat alone
   delivers 228 postings (19 India-remote-matching) from a single tenant.
   The Step 2 "defer" recommendation is superseded now that a real tenant
   URL closed the gap — this is a strong second-priority source, not a
   someday item.
3. **Ashby — new platform family, add to the watcher scope.** Not in the
   original Decision Doc's D1/D3 (which only covered Greenhouse/Lever/
   Workday) but Step 2b found it delivers the *only* two India-relevant
   confirmed hits in all of Phase 0 (SigNoz, Swirlds Labs). Given OAOS's
   stated remote-India priority, this is worth folding into the Phase 1
   "company ATS watcher" interface as a fourth platform, not treated as
   out-of-scope. **This is a scope change from the Decision Doc — flagging
   explicitly rather than quietly expanding it.**
4. **Lever — build alongside Greenhouse, lower priority.** Only one live
   confirmed source (Sysdig, 5 postings) after Teleport's token turned out
   to be dead. Cheap to add given the shared interface shape with
   Greenhouse, but don't expect much volume from it based on this sample.
5. **freehire.dev query-first source — build to fill the worldwide-net
   gap the 8 company watchers above can't cover alone.** Confirmed deep
   for the target tech categories (Step 1); confirmed India-thin (3.4%
   average). The 8 company-first watchers above are the actual India
   coverage mechanism; freehire is the volume backbone for everything
   else.
6. **Manual/Stage-1-2 coverage stays necessary for AccuKnox and DSR
   Corporation specifically** — both Tier 1, both likely on platforms
   (Zoho, Applytojob) outside any watcher family probed in Phase 0.
   Automating these would require a new source-family decision, not a
   token-guessing fix.

## Open risks (updated after Step 2b)

- **Loft Labs' Ashby hit is unverified** — the API response carries no
  organization-identifying field, so a 200-OK-with-empty-jobs result
  can't be distinguished from an unrelated org that happens to use the
  same generic token. Confirm manually before any Phase 1 build touches
  it.
- **6 of the 7 India-focused companies re-probed in Step 2b (Last9, Civo,
  One2N, Appsmith, Solo.io, LocalStack) were never checked against Ashby**
  — Step 2b's Ashby task list was fixed to 5 specific companies (SigNoz,
  Chainguard, Loft Labs, Swirlds Labs, Teleport) and didn't include these.
  Given Ashby just produced 2/2 of Phase 0's India-relevant hits, this is
  the single highest-value remaining gap to close before considering ATS
  coverage exhausted.
- **AccuKnox and DSR Corporation remain fully unautomated** despite being
  Tier 1 — both need a Zoho Recruit / Applytojob investigation (a new
  source-family question, out of scope for Greenhouse/Lever/Workday/Ashby
  probing) before they can join a watcher rather than manual coverage.
- **freehire is a hobby project with no SLA** (carried over from Step 1 —
  unchanged by Step 2b) — wrap it in the existing health-check-canary +
  graceful-degradation pattern, don't treat it as guaranteed-available.
- **Total request count across all of Phase 0 (118) is well above the
  original single-session "~60" framing** — not a ToS/rate-limit problem
  (all official APIs, 1/sec throughout, largest single-source hit was 45
  freehire requests), but worth carrying into any future multi-step
  research session: set the budget per-step explicitly rather than as one
  session-wide number decided before the step count was known.
