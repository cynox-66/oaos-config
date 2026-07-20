# OAOS — Definitive Implementation Roadmap

Frozen vision. Implementation planning only.
Optimized for: long-term leverage, low operating cost (₹0–100/mo), low maintenance (<1hr/wk), reliability.
Single operator. No server babysitting. No enterprise infrastructure.

---

## PART A — CAPABILITY SPECIFICATIONS

Each capability specified as: Purpose / Inputs / Outputs / Dependencies / Cost / Maintenance / Failure modes / Build priority.

Build priority key: **P0** = foundational root, build first. **P1** = depends on P0. **P2** = depends on P1. **P3** = depends on accumulated data/quality. Priority reflects dependency position, NOT time-to-build or short-term value.

---

### C1 — Multi-Source Discovery

**Purpose.** Continuously surface opportunities from all sources so the operator is never the bottleneck on finding. Permanent layer, not a phase. Matures Stage 1 (manual) → Stage 2 (semi-automated) → Stage 3 (automated).

**Inputs.** Job boards, internship boards, freelance platforms, startup/funding signals, network signals, OSS programs (LFX/GSoC/CNCF). At Stage 1, the operator pastes/links opportunities. At Stage 2, saved searches and email alerts are parsed. At Stage 3, free stable feeds (RSS, official APIs, public endpoints) ingest automatically.

**Outputs.** Normalized opportunity records (one schema regardless of source) entering the pipeline with: source, role, company, URL, raw description, date found.

**Dependencies.** None to begin (Stage 1 is manual). Stage 3 automation depends on the normalization schema (C2-adjacent) being stable so ingested records are processable.

**Cost.** Stage 1–2: ₹0. Stage 3: ₹0 *if and only if* each source uses a free ingestion path. A source requiring a paid API is admitted only when it can be done free OR its measured income justifies cost.

**Maintenance.** Stage 1: near-zero. Stage 3: highest in the system — feeds and scrapers break. Mitigation: prefer RSS/official APIs/email-alert parsing over brittle HTML scraping; admit one source at a time so breakage is isolated.

**Failure modes.** (1) Source format changes → ingestion silently stops. (2) Duplicate flooding from overlapping sources. (3) Low-quality opportunities drowning high-fit ones. Mitigations: per-source health check in weekly report; dedupe on company+role+URL; scoring gate downstream.

**Build priority.** P0 as a permanent layer (Stage 1 exists from day one). Stage 3 automation per-source is P2 — sequenced after the processing loop exists, because automating intake into a pipeline that can't reason about records produces noise.

---

### C2 — Opportunity Scoring

**Purpose.** Decide where finite outreach/application effort goes. Two-axis: Quality (how good for trajectory) × Match (how strong the operator's specific leverage). The system's central reasoning primitive.

**Inputs.** Normalized opportunity record + research summary + known contacts + evidence inventory.

**Outputs.** Quality score (0–50), Match score (0–50), Total (0–100), Tier (S/A/B/C).

**Dependencies.** C1 (something to score). Benefits from C3 (contacts inform accessibility) and C4 (evidence informs match), but degrades gracefully without them.

**Cost.** ₹0. One Gemini call per scoring, free tier.

**Maintenance.** Low. Rubric is static text; revise occasionally as calibration data accrues.

**Failure modes.** (1) Score inflation (everything looks like A). (2) Rubric drift from reality. Mitigation: periodic calibration against actual response outcomes (feeds from C10).

**Build priority.** P0. Root of the intelligence layer.

---

### C3 — Contact Discovery

**Purpose.** Resolve the human attached to an opportunity — because in referral/founder/cold-outreach cases the person *is* the opportunity.

**Inputs.** Company/opportunity record. Sources: GitHub contributor graphs (OSS), public team pages, LinkedIn (manual), CNCF Slack.

**Outputs.** Contact records: name, role, channel (GitHub/email/LinkedIn/Slack), reachability, overlap notes, linked to opportunity.

**Dependencies.** C1 (an opportunity to attach a person to).

**Cost.** ₹0. GitHub API free tier; manual LinkedIn/Slack.

**Maintenance.** Low. The contributor-scan script is the only moving part; it's stable against the GitHub API.

**Failure modes.** (1) Stale employment (person left company). (2) No reachable contact (recruiter-gated). Mitigation: reachability score; note last-verified date.

**Build priority.** P0. Needed for outreach and for the accessibility input to scoring.

---

### C4 — Evidence Matching (FIRST-CLASS, mandatory)

**Purpose.** Answer "what proof should be shown to this opportunity?" Connects each opportunity to the operator's strongest relevant capability evidence. Core to acquisition — outreach and applications without targeted proof are weak.

**Inputs.** Opportunity record (domain, role, required skills) + the operator's evidence inventory (OSS PRs, technical writing, projects, RFCs, portfolio, freelance/client work).

**Outputs.** Ranked list of 1–3 evidence assets best suited to this opportunity, with the one-line relevance reason for each.

**Dependencies.** C2 (uses scoring context) + a maintained evidence inventory.

**Cost.** ₹0. Matching is a Gemini call or a tag-overlap rule.

**Maintenance.** Low–medium. The evidence inventory must be kept current as the operator produces new work — this is the only ongoing human upkeep, and it's intrinsic value (the operator should track their own proof regardless).

**Failure modes.** (1) Stale inventory → matches miss recent strong work. (2) Over-generic matching. Mitigation: add-evidence step in weekly routine; relevance reason forces specificity.

**Build priority.** P0/P1. Foundational; built in the first intelligence pass. The implementation can be a flat tagged inventory + overlap match — simplified, not removed.

---

### C5 — Recommended Action Generation

**Purpose.** Convert score + context into a directive: Apply / Outreach / Both / Ignore. Removes per-opportunity deliberation.

**Inputs.** Tier (C2) + opportunity type (job vs. OSS vs. freelance) + contact accessibility (C3).

**Outputs.** One action label per opportunity + one-line justification.

**Dependencies.** C2, C3.

**Cost.** ₹0. Rule logic, no model call required.

**Maintenance.** Low. A small ruleset; tune as outcome data accrues.

**Failure modes.** Wrong action from a wrong score (inherits C2 errors). Mitigation: human gate always reviews.

**Build priority.** P1.

---

### C6 — Application Preparation

**Purpose.** Produce the application package (resume variant + cover letter) so the operator edits rather than writes from scratch. Permanent core output, not a completeness add-on.

**Inputs.** Opportunity record + matched evidence (C4) + base resume + role description.

**Outputs.** Tailored resume variant + cover letter draft.

**Dependencies.** C2 (worth preparing only for qualified opportunities), C4 (which proof to foreground).

**Cost.** ₹0. Gemini drafting.

**Maintenance.** Low. Prompt templates; base resume kept current.

**Failure modes.** (1) Generic output. (2) Fabricated claims. Mitigation: prompt grounds strictly in real evidence inventory; human gate verifies before any submission.

**Build priority.** P1.

---

### C7 — Outreach Preparation

**Purpose.** Draft channel-appropriate outreach (email/LinkedIn/GitHub/Slack) referencing matched evidence.

**Inputs.** Contact (C3) + opportunity + matched evidence (C4) + ask type.

**Outputs.** Draft message(s) + the evidence referenced + customization notes.

**Dependencies.** C3, C4.

**Cost.** ₹0. Gemini drafting.

**Maintenance.** Low. Prompt templates.

**Failure modes.** (1) Templated tone. (2) Wrong/stale facts about the target. Mitigation: customization notes flag what to verify; human gate sends.

**Build priority.** P1.

---

### C8 — Follow-Up Management

**Purpose.** Prevent opportunities dying from inaction. Most responses occur on follow-up.

**Inputs.** Sent outreach + send date + response status.

**Outputs.** Follow-up queue with due dates (e.g. day 4/10/17) + drafted follow-up messages.

**Dependencies.** C7 (something was sent).

**Cost.** ₹0. Date logic + drafting.

**Maintenance.** Low. Reminder logic is static.

**Failure modes.** (1) Following up on dead leads. (2) Over-following (annoyance). Mitigation: capped sequence; final-touch rule.

**Build priority.** P1.

---

### C9 — Approval-Based Automatic Execution

**Purpose.** After explicit human approval, execute sends/submissions/record-updates automatically — removing repetitive execution labor while preserving judgment.

**Inputs.** Human-approved drafts + target endpoints (email, etc.).

**Outputs.** Sent messages, submitted forms, updated records, triggered follow-up timers.

**Dependencies.** C6/C7 prep quality must be consistently approve-with-minimal-edits — otherwise automation adds risk without saving real effort.

**Cost.** ₹0 on free automation tiers until volume exceeds them; at that point income should exist to fund a paid tier within ₹100/mo.

**Maintenance.** Medium. Automation scenarios fail silently. Mitigation: approval gate converts a failure into a *blocked send* rather than a *wrong send*; per-run logging surfaced in weekly report.

**Failure modes.** (1) Silent scenario failure. (2) Wrong-recipient send. (3) Auth token expiry. Mitigation: approval gate, dry-run confirmation, token health check.

**Build priority.** P3. Last among execution capabilities — gated by prep quality, not by difficulty. Reputation-bearing, so it ships only when trustworthy.

---

### C10 — Source Performance Tracking

**Purpose.** Know which sources produce responses/interviews/offers/income so effort concentrates where it works. Instrumentation, runs continuously from first real outreach.

**Inputs.** Per-opportunity source tag + outcome events (response, interview, offer, income).

**Outputs.** Source Performance Report: opportunities, responses, interviews, offers, income — by source.

**Dependencies.** C1 (source tagging) + outcome capture (C8 outcomes + manual outcome logging).

**Cost.** ₹0. Aggregation over existing records.

**Maintenance.** Low. Mostly automatic; weekly glance.

**Failure modes.** Under-logged outcomes → misleading reports. Mitigation: outcome logging built into the daily/weekly routine.

**Build priority.** P2. Instrument early so data accrues for C12, even if reports are read infrequently.

---

### C11 — Income Attribution

**Purpose.** Track what actually generates money — the root objective made measurable. Source → opportunity → outcome → income.

**Inputs.** Closed outcomes with income amount + their originating source/opportunity.

**Outputs.** Income Attribution Report.

**Dependencies.** C10 (shares the outcome data layer).

**Cost.** ₹0.

**Maintenance.** Low. A few entries per income event.

**Failure modes.** Sparse data early (few income events) → low signal. Accepted; signal grows over time.

**Build priority.** P2.

---

### C12 — Long-Term Opportunity Intelligence

**Purpose.** Use accumulated outcome data to weight discovery and recalibrate scoring — the system learning where leverage actually is. Genuine end-state.

**Inputs.** Historical data from C10 + C11 + scoring vs. outcome deltas.

**Outputs.** Adjusted source weights, recalibrated scoring guidance, focus recommendations.

**Dependencies.** C10 + C11 with enough history to exceed noise.

**Cost.** ₹0. Analysis over owned data.

**Maintenance.** Low. Periodic, read-only.

**Failure modes.** Premature conclusions from thin data. Mitigation: minimum-data threshold before acting on signals.

**Build priority.** P3. Built last because it consumes everything else.

---

## PART B — ARCHITECTURE

### 1. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│ DISCOVERY LAYER (permanent, matures S1→S2→S3)            │
│   Jobs · Internships · Freelance · Startup · Network·OSS │
└───────────────────────────┬─────────────────────────────┘
                            ▼  normalized opportunity record
┌─────────────────────────────────────────────────────────┐
│ INTELLIGENCE LAYER                                       │
│   C2 Scoring → C5 Recommended Action                     │
│   C3 Contact Discovery   C4 Evidence Matching            │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ PREPARATION LAYER                                        │
│   C6 Application Package · C7 Outreach Package           │
│   C8 Follow-up Scheduling                                │
└───────────────────────────┬─────────────────────────────┘
                            ▼
                  ╔═════════════════════╗
                  ║ HUMAN GATE          ║  review · edit · approve
                  ╚══════════╦══════════╝
                            ▼
┌─────────────────────────────────────────────────────────┐
│ EXECUTION LAYER (post-approval only)                     │
│   C9 Send · Submit · Update · Trigger follow-ups         │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ MEASUREMENT LAYER                                        │
│   C10 Source Performance · C11 Income Attribution        │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ LONG-TERM INTELLIGENCE (C12)                             │
│   feeds weights back into Discovery + Scoring  ──────────┼──┐
└─────────────────────────────────────────────────────────┘  │
        ▲                                                     │
        └─────────────────────── feedback ────────────────────┘
```

### 2. Data Flow Architecture

```
raw source item
   → normalize (source, company, role, url, desc, date)
   → dedupe (company+role+url)
   → score (C2) → tier
   → resolve contact (C3) + match evidence (C4)
   → recommend action (C5)
   → IF Apply/Both: prepare application (C6)
     IF Outreach/Both: prepare outreach (C7)
   → HUMAN GATE (approve/edit/reject)
   → execute approved (C9)
   → schedule follow-ups (C8)
   → record outcome events
   → aggregate → source performance (C10) + income (C11)
   → analyze history → weights/calibration (C12) → back to score & discovery
```

Single normalized record travels the whole pipeline. Every source converges to one schema before scoring — this is what makes sources "equal citizens."

### 3. Discovery Architecture (the maturing layer)

```
STAGE 1 — Manual
  Operator drops any opportunity (link/paste) → normalize → pipeline.
  Cost ₹0. Maintenance ~0. Always available as fallback.

STAGE 2 — Semi-automated
  Saved searches + email alerts (job boards, freelance, funding newsletters)
  → inbox label → parse → normalize → pipeline.
  Cost ₹0. Maintenance low (parser per alert format).

STAGE 3 — Automated, per-source
  Free stable feeds only: RSS, official APIs, public endpoints.
  Each source: ingest → normalize → dedupe → pipeline.
  Admission test (ALL must pass):
    [ ] Free ingestion path exists (no paid API), OR measured income justifies cost
    [ ] Stable interface (feed/API, not brittle HTML)
    [ ] Adds <10 min/week maintenance
    [ ] Survives a format change without silent total failure (health check exists)
  Sources added ONE at a time. Income-relevant sources first.
```

Stages coexist. Stage 1 never disappears — it's the universal intake for anything not yet automated.

### 4. Automation Architecture

```
Automation is allowed for EXECUTION, never for JUDGMENT.

Tier 1 — Auto, no approval:
  discovery ingest · research · scoring suggestion · contact discovery ·
  evidence matching · draft generation · follow-up scheduling · reporting

Tier 2 — Auto ONLY after explicit human approval:
  send email · send LinkedIn/Slack · send follow-up · submit application/form ·
  update records/status

Tier 3 — NEVER automated:
  strategic decisions · prioritization overrides · reputation-sensitive comms ·
  high-context relationship decisions · major career decisions

Platform: free-tier orchestration (Make.com free, or scheduled scripts).
Failure handling: approval gate makes execution failures fail SAFE (blocked, not wrong-sent).
```

### 5. Measurement Architecture

```
Event capture (continuous from first outreach):
  opportunity_created(source) · outreach_sent · response_received ·
  interview_scheduled · offer_received · income_recorded(amount)

Aggregations:
  C10 Source Performance  = events grouped by source
  C11 Income Attribution  = income grouped by source → opportunity → outcome
  Weekly Acquisition Report = discovered / qualified / sent / responses / interviews

Consumed by:
  C12 → source weights + scoring calibration (only past a min-data threshold)
```

---

## PART C — IMPLEMENTATION

### 6. Phase-by-Phase Plan

Phases ordered by dependency correctness and constraint-safety. Not by time-to-build. Each phase is "done" when reliable, however long that takes.

**Phase 1 — Intelligence core + Stage-1 discovery**
Capabilities: C1(Stage 1), C2, C3, C4, C5.
Outcome: any opportunity, from any source, can be dropped in, scored, attached to a contact and matched evidence, and assigned an action. The reasoning spine of the whole system.

**Phase 2 — Preparation layer**
Capabilities: C6, C7, C8.
Outcome: qualified opportunities yield a full prepared package (application and/or outreach) plus a follow-up schedule. Human edits and sends manually.

**Phase 3 — Measurement instrumentation**
Capabilities: C10, C11 (+ Weekly Acquisition Report).
Outcome: every outcome is captured from here onward. Reports may be read infrequently; the point is data accrual for C12.

**Phase 4 — Discovery Stage 2**
Capability: C1(Stage 2).
Outcome: saved searches + email-alert parsing reduce manual intake. Per-format parsers, low maintenance.

**Phase 5 — Discovery Stage 3, per-source**
Capability: C1(Stage 3).
Outcome: automated free-feed ingestion, one admitted source at a time, each passing the admission test. Expected to be long-running; that's acceptable.

**Phase 6 — Approval-based execution**
Capability: C9.
Outcome: approved drafts execute automatically. Ships only once C6/C7 quality is consistently approve-with-minimal-edits.

**Phase 7 — Long-term intelligence**
Capability: C12.
Outcome: accumulated data recalibrates scoring and weights discovery. End-state.

### 7. Repository Structure

```
oaos-config/
├── README.md
├── CHARTER.md                      # frozen vision (this roadmap's parent)
├── ROADMAP.md                      # this document
├── .env                            # gitignored
├── .env.example
├── discovery/
│   ├── stage1-manual.md            # intake procedure
│   ├── stage2-alerts/              # email-alert parsers (Phase 4)
│   └── stage3-feeds/               # per-source ingest scripts (Phase 5)
├── prompts/
│   ├── company-research.md
│   ├── scoring-assist.md
│   ├── evidence-match.md           # C4
│   ├── recommended-action.md       # C5
│   ├── application-prep.md         # C6
│   ├── outreach-draft-email.md
│   ├── outreach-draft-linkedin.md
│   ├── outreach-draft-github.md
│   ├── followup-draft.md
│   └── lfx-proposal.md
├── scoring/
│   ├── rubric.md
│   └── examples.md
├── evidence/
│   └── inventory.md                # tagged evidence assets (C4 source of truth)
├── scripts/
│   ├── github-contributor-scan.ts  # C3
│   └── normalize.ts                # source → unified record
├── automation/
│   └── make-exports/               # scenario JSON (Phases 6+)
├── measurement/
│   └── report-templates.md         # C10/C11 + weekly report
└── docs/
    ├── api-setup.md
    ├── airtable-setup.md
    └── automation-setup.md
```

### 8. Airtable Structure

Tables (the data backbone; kept lean, expanded only as phases require):

```
Opportunities   — pipeline record + score + tier + action + source
Contacts        — C3 output, linked to Opportunities
Evidence        — C4 inventory: type, url, relevance, tech tags (FIRST-CLASS)
Outreach        — C7/C8: draft, channel, status, follow-up dates, evidence used
Outcomes        — C10/C11: event type, date, income amount, linked opportunity+source
```

Views are operational only (ranked queue, follow-ups due, pipeline kanban). Views are not a deliverable and are not optimized for.

### 9. Automation Stack

```
Orchestration : Make.com (free tier) — native Airtable/Gmail/HTTP, no server
Scheduling    : Make.com scheduled scenarios (later: cron-equivalent free tier)
Notifications : Telegram bot (free) — daily digest only, never per-event
Execution     : post-approval sends via Make.com modules / provider APIs
Constraint    : stay on free tiers until volume forces paid; income funds any paid step within ₹100/mo
```

### 10. API Stack

```
Gemini (free)        : research, scoring suggestion, evidence match, drafting
GitHub (free)        : contributor/contact discovery
Telegram (free)      : daily digest
Airtable (free)      : data backbone + native automations
Make.com (free)      : orchestration + post-approval execution
(Deferred/optional)  : paid contact-enrichment or job APIs — only if free path
                       absent AND measured income justifies, within ₹100/mo
Permanently excluded : anything requiring a babysat server or enterprise tier
```

### 11. Build Sequence

```
1.  Stage-1 manual intake procedure + normalization schema        (C1-S1)
2.  Scoring rubric + scoring prompt                               (C2)
3.  Contact discovery (GitHub scan live; manual for non-OSS)      (C3)
4.  Evidence inventory + evidence-match prompt                    (C4)
5.  Recommended-action ruleset                                    (C5)
        ── Phase 1 complete: reasoning spine operational ──
6.  Application-prep prompt + base resume                         (C6)
7.  Outreach prompts (email/linkedin/github)                      (C7)
8.  Follow-up scheduling + follow-up prompt                       (C8)
        ── Phase 2 complete: full prepared packages ──
9.  Outcomes table + event logging in routine                    (C10)
10. Income attribution fields + weekly report template           (C11)
        ── Phase 3 complete: instrumentation live ──
11. Email-alert parsers + saved-search intake                    (C1-S2)
        ── Phase 4 complete: semi-automated discovery ──
12. Per-source free-feed ingest, one at a time, admission-tested (C1-S3)
        ── Phase 5: ongoing, long-running ──
13. Approval-gated execution scenarios                           (C9)
        ── Phase 6: ships when prep quality is trustworthy ──
14. Historical analysis → source weights + scoring calibration   (C12)
        ── Phase 7: end-state ──
```

---

## CONSTRAINT LEDGER (binding checks)

```
Operating cost   : ₹0 through Phase 4. Phase 5 free-feeds-only rule holds ₹0.
                   Phase 6 free-tier until volume; income funds paid step ≤₹100/mo.
Maintenance      : <1hr/wk. Pressure point = Phase 5 (per-source breakage).
                   Held by: stable feeds only, one source at a time, health checks.
Reliability      : enforced by dependency order — no layer built on an unproven one.
Long-term leverage: protected by treating Discovery (C1) and Intelligence (C12)
                   as foundational compounding layers, never deferred as luxuries.
```

## EXCLUDED PERMANENTLY

Multi-agent systems · RAG · vector databases · knowledge graphs ·
hosted/multi-tenant frontend (a local, self-hosted web UI served by OAOS on
the operator's machine is permitted per D16 — see
docs/DISCOVERY-SYNTHESIS-DECISIONS.md) · local LLM infrastructure ·
relationship influence scoring · unapproved autonomous outreach · unapproved
autonomous applications · enterprise-grade automation.
