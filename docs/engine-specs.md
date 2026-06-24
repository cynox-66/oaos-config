# OAOS — Engine Specifications

Implementation-level system behavior for the 12 core engines.
Frozen vision assumed. No architecture, no phases. Logic, rules, data, decisions only.

Conventions:
- `Opportunity`, `Contact`, `Evidence`, `Outreach`, `Outcome` = Airtable records.
- LLM = Gemini 2.0 Flash unless noted. Every LLM call returns strict JSON; callers validate before write.
- All scores integers unless stated. All dates ISO-8601. Currency INR.

---

## 1. Opportunity Normalization Engine

**Purpose.** Convert heterogeneous source items (job post, freelance listing, OSS program, funding signal, manual paste) into one canonical `Opportunity` object so every downstream engine reads one schema. Without this, every engine needs per-source branches.

**Inputs.**
```
RawItem {
  source_type   : enum(job_board|internship|freelance|startup_signal|network|oss)
  source_name   : string            // "wellfound", "upwork", "lfx", "manual"
  raw_payload   : object|string     // scraped JSON, email body, or pasted text
  url           : string|null
  fetched_at    : datetime
}
```

**Outputs.**
```
Opportunity {
  id              : string          // generated
  company         : string
  role            : string
  category        : enum(Job|Internship|Freelance|Startup|OSS|Other)
  domain          : string[]        // controlled vocab, see Decision Rules
  source_name     : string
  source_type     : enum
  url             : string|null
  description_raw : string          // trimmed, max 5000 chars
  description_norm: string          // cleaned, boilerplate stripped
  comp_min        : int|null        // INR/month or project, normalized
  comp_max        : int|null
  comp_basis      : enum(monthly|hourly|project|equity|unpaid|unknown)
  remote          : enum(remote|hybrid|onsite|unknown)
  location        : string|null
  date_found      : date
  fingerprint     : string          // dedupe key, see Logic
  status          : "Discovered"    // always initial
  completeness    : float           // 0..1, fraction of core fields present
}
```

**Logic.**
1. Route `raw_payload` to a source adapter by `source_name`. Adapter returns a partial `Opportunity` with whatever fields it can map. Adapters are the only source-specific code; everything downstream is source-agnostic.
2. Clean `description_raw → description_norm`: strip HTML, collapse whitespace, remove known boilerplate ("About us", "Equal opportunity employer", cookie notices) via a regex blocklist.
3. Normalize compensation: parse currency + period → INR. USD→INR at a static fallback rate stored in config (refreshed manually monthly; exactness not required, only order-of-magnitude for scoring). Hourly→monthly uses 160 hrs. If unparseable → `comp_basis=unknown`, comps null.
4. Derive `domain[]` by keyword match against the controlled vocabulary (Decision Rules) over `role + description_norm`.
5. Compute `fingerprint = sha1(lower(normalize_company) + "|" + lower(normalize_role) + "|" + host(url))`. `normalize_company` strips Inc/Ltd/GmbH and punctuation. Host-only URL so the same role at different tracking URLs collapses.
6. Compute `completeness` = present_core_fields / 6, where core = {company, role, category, domain≥1, url, comp_basis≠unknown}.

**Decision Rules.**
- Domain controlled vocab (multi-assign): `Cloud-Native, Kubernetes, Security, eBPF, Chaos-Engineering, Networking, DevTools, Infra, Observability, Web/Frontend, Backend, Data, AI/ML, Other`.
- Category inference when adapter can't set it: presence of "intern" → Internship; "contract/freelance/gig" → Freelance; LFX/GSoC/CNCF source → OSS; funding/"hiring our first" → Startup; else Job.
- If `completeness < 0.4` → set status `Discovered` but flag `needs_enrichment=true` (research engine fills before scoring).

**Edge Cases.**
- Duplicate fingerprint already in base → do not insert; instead update `date_found` only if newer source is higher-signal (manual > automated), and append source to a `also_seen_in` list. Prevents flooding.
- Compensation in equity-only → `comp_basis=equity`, comps null, do not penalize in normalization (scoring handles).
- Pasted free-text manual entry with no URL → fingerprint uses empty host; rely on company+role. Accept higher false-merge risk for manual; log a soft warning.
- Non-English description → pass through; LLM-based research/scoring is language-robust. Do not attempt translation here.

**Validation Criteria.**
- 100% of outputs validate against the `Opportunity` JSON schema (required fields non-null except the allowed nullables).
- Re-normalizing the same `RawItem` twice yields identical `fingerprint` (determinism test).
- On a fixture set of 20 hand-labeled items per source, category and ≥1 domain match the label ≥90%.

**Future Extensions.** Per-source confidence weighting; learned boilerplate stripping; auto currency-rate refresh via a free FX feed (admission-tested).

---

## 2. Opportunity Scoring Engine

**Purpose.** Produce Quality(0–50), Match(0–50), Total(0–100), Tier(S/A/B/C) so effort is allocated. Rubric already exists (`scoring/rubric.md`); this spec is the *mechanism* around it.

**Inputs.**
```
ScoreRequest {
  opportunity     : Opportunity
  research        : object|null     // from research enrichment
  contacts        : Contact[]       // may be empty
  evidence_match  : EvidenceMatch|null  // from engine 3, if already run
}
```

**Outputs.**
```
Score {
  quality {domain, oss, leverage, stage, total}
  match   {overlap, evidence, contact, network, total}
  total   : int
  tier    : enum(S|A|B|C)
  confidence : float                // 0..1
  rationale  : string
  scored_at  : datetime
  inputs_hash: string               // for staleness detection
}
```

**Logic.**
1. Assemble a scoring context: opportunity fields + research summary + contact accessibility signal + evidence availability. Each rubric factor maps to specific context fields (e.g. `match.contact` reads from `contacts[].reachability`).
2. Two-pass scoring:
   - **Rule pass** computes deterministic partials where possible: `quality.stage` from `research.stage`; `match.contact` = f(best contact reachability); `match.evidence` = f(evidence_match.top_score).
   - **LLM pass** scores the judgment-heavy factors (`quality.domain`, `quality.leverage`, `match.overlap`) given the rubric and context, returning integers + per-factor reason.
3. Merge: rule-pass values override LLM where deterministic; sum to totals; derive tier by thresholds (S≥85, A≥70, B≥50, else C).
4. `confidence` = weighted function of input completeness: `0.5*opportunity.completeness + 0.3*(research?1:0) + 0.2*(contacts.length>0?1:0)`. Low confidence does not change the score but flags it for human attention.
5. `inputs_hash = sha1(opportunity.fingerprint + research_version + contacts_ids + evidence_match.id)`. If a re-score request has the same hash as the stored score, skip (idempotent).

**Decision Rules.**
- Tie/borderline: if `total` within 2 of a tier boundary AND `confidence < 0.6` → tag `tier_uncertain=true`; surface to human.
- Equity-only / unpaid opportunities: cap `quality.leverage` contribution unless OSS category (OSS unpaid is expected, not penalized). Encoded in rubric context, not a separate hack.
- Missing research → still score, but `quality.domain`/`leverage` LLM pass runs on opportunity text alone; `confidence` drops accordingly.

**Edge Cases.**
- LLM returns out-of-range integers → clamp to factor max, log anomaly.
- LLM returns malformed JSON → one retry with a stricter "JSON only" instruction; second failure → fall back to rule-pass-only score with `confidence ≤ 0.4` and `rationale="LLM scoring unavailable"`.
- Score becomes stale when research or contacts change → `inputs_hash` mismatch triggers re-score eligibility (not automatic; queued).

**Validation Criteria.**
- Deterministic factors reproduce exactly across runs on fixed input.
- On a labeled calibration set (≥20 opportunities with known good tiers), tier agreement ≥80%; no S assigned to anything a human labeled C (no catastrophic inversions).
- Monotonicity test: improving any single factor never lowers total.

**Future Extensions.** Calibration feedback from Engine 12 adjusting factor weights; per-category rubric variants (freelance vs. OSS weight differently).

---

## 3. Evidence Matching Engine

**Purpose.** Select the 1–3 evidence assets that best prove capability *for this specific opportunity*, with a one-line relevance reason each. First-class capability.

**Inputs.**
```
MatchRequest {
  opportunity : Opportunity        // domain[], role, description_norm
  inventory   : Evidence[]         // full evidence table
}
Evidence {
  id, title, type(PR|Article|RFC|Project|Talk|Freelance|Client),
  url, tech_tags[], domains[], relevance_blurb, recency_date, strength(1..5)
}
```

**Outputs.**
```
EvidenceMatch {
  id          : string
  ranked      : [{evidence_id, fit_score, reason}]   // length ≤3
  top_score   : float                                 // ranked[0].fit_score, 0..1
  coverage_gap: string|null         // capability the opp wants that nothing proves
}
```

**Logic.**
1. Candidate filter: keep evidence sharing ≥1 `domain` or `tech_tag` with the opportunity.
2. Score each candidate:
   ```
   fit = 0.45 * tag_overlap_ratio
       + 0.30 * domain_overlap_ratio
       + 0.15 * (strength/5)
       + 0.10 * recency_factor        // exp decay, halflife 18 months
   ```
   `*_overlap_ratio` = |intersection| / |opportunity side|.
3. Rank by `fit` desc; take top 3 with `fit ≥ 0.25` (floor avoids forcing weak matches).
4. For each kept item, LLM generates a one-line `reason` tying that specific asset to this opportunity's stated needs (grounded in `relevance_blurb` + opportunity text; no fabrication).
5. `coverage_gap`: if the opportunity's top required capability (heuristic: most frequent domain/tag) has no asset with `fit≥0.4`, name it. Used by human to decide whether to build proof before applying.

**Decision Rules.**
- Never return an asset with `fit < 0.25`. Return fewer (even zero) rather than weak matches.
- Type preference tie-break: for security/eBPF opps prefer `PR/RFC`; for writing/devrel opps prefer `Article/Talk`; for freelance prefer `Freelance/Client/Project`.
- Zero matches → `ranked=[]`, `coverage_gap` set, downstream packages must proceed without a citation and flag it.

**Edge Cases.**
- Empty inventory → `ranked=[]`, hard flag; Engine 6/7 degrade to capability claims without proof (weaker, allowed).
- Stale inventory (no recency update in 6 months) → emit maintenance warning in weekly report; matching still runs.
- Over-tagged generic asset (e.g. devjaiswal.me tagged everything) → strength acts as dampener; consider a max-2 appearances rule so one asset doesn't win every opportunity.

**Validation Criteria.**
- Deterministic `fit` ranking on fixed inventory.
- On labeled (opportunity, expected-best-evidence) pairs, top-1 contains the expected asset ≥75%.
- No returned item ever below the 0.25 floor.

**Future Extensions.** Learned weights from which cited evidence correlates with responses (Engine 12); auto-suggest new evidence to create from repeated `coverage_gap`s.

---

## 4. Recommended Action Engine

**Purpose.** Map scored opportunity → {Apply, Outreach, Both, Ignore} deterministically. Removes per-item deliberation.

**Inputs.** `Opportunity` (category), `Score` (tier, confidence), `Contact[]` (best reachability), `EvidenceMatch` (top_score).

**Outputs.**
```
Recommendation { action: enum(Apply|Outreach|Both|Ignore), reason: string, requires_human_review: bool }
```

**Logic / Decision Rules.** Pure decision table evaluated top-down; first match wins.

```
# tier  | category    | contact reachable? | → action     notes
C       | *           | *                  | Ignore       unless pipeline thin (human override)
*       | OSS         | yes                | Outreach     OSS = relationship-led, no "apply" form
*       | OSS         | no                 | Outreach     find/warm a contact first
S/A     | Job/Intern  | yes                | Both         apply + reach the human
S/A     | Job/Intern  | no                 | Apply        no human → formal apply only
S/A     | Freelance   | yes                | Outreach     freelance won by pitch, not application
S/A     | Freelance   | no                 | Apply        platform proposal
S/A     | Startup     | yes                | Both
S/A     | Startup     | no                 | Outreach     startups hire via network; cold-reach founder
B       | Job/Intern  | yes                | Outreach     apply only if effort is low; lead with human
B       | *           | no                 | Ignore       conserve effort
```

- `requires_human_review=true` whenever `score.confidence<0.6` OR `tier_uncertain` OR `coverage_gap` present.
- "contact reachable" = exists a Contact with reachability ≥3.

**Edge Cases.**
- Pipeline-thin mode (human-set flag): C-tier "Ignore" becomes "Outreach" for top-of-C only. A deliberate, human-toggled relaxation, never automatic.
- Conflicting signals (S-tier but empty evidence + coverage_gap) → action stands but `reason` names the gap and `requires_human_review=true`.

**Validation Criteria.** Table is total (every input combination maps to exactly one action). Re-run determinism. Spot-check 15 cases against human judgment, ≥90% agreement.

**Future Extensions.** Action thresholds tuned by Engine 12 (e.g. if B-tier outreach historically converts, promote it).

---

## 5. Contact Discovery & Ranking Engine

**Purpose.** Find the human(s) for an opportunity and rank who to approach first. (No social-graph "influence scoring" — banned. Ranking is reachability + role-relevance only.)

**Inputs.** `Opportunity` (company, domain), plus candidate sources: GitHub contributor scan output, manual LinkedIn entries, CNCF Slack handles, public team pages.

**Outputs.**
```
Contact {
  id, name, company, title, seniority, channels{github,email,linkedin,slack},
  reachability(1..5), role_relevance(1..5), oss_overlap, last_verified, primary(bool)
}
RankedContacts { opportunity_id, ordered: Contact[], primary_contact_id }
```

**Logic.**
1. Gather candidates for the company from all available sources; dedupe people by (name + company) and by matching GitHub/LinkedIn handles.
2. `reachability` (existing rule): 1 base +2 email +1 twitter/blog +1 followers>100, capped 5. Direct channel (GitHub/Slack where they're active) counts as email-equivalent.
3. `role_relevance` (1..5): map title to relevance for *this* opportunity's domain — e.g. for an eBPF security role, a "Security Engineer/Maintainer" =5, generic SWE=3, recruiter=2, unrelated=1.
4. Rank by `(role_relevance desc, reachability desc, seniority_pref)`. `seniority_pref` order: Founder > Eng Manager > Staff/Principal > Senior > Mid > Recruiter (recruiter last, per charter intent).
5. `primary_contact` = rank[0]. Mark others as secondary fallbacks.

**Decision Rules.**
- A reachable mid-level engineer outranks an unreachable founder. Reachability gates usefulness.
- Recruiter only becomes primary if no engineer/founder contact exists at all.
- `last_verified` older than 6 months → downrank reachability by 1 (employment may be stale).

**Edge Cases.**
- No contacts found → `ordered=[]`, `primary_contact_id=null`; Recommended Action sees "not reachable".
- Same person across multiple opportunities (multi-company history) → contact record reused, linked to multiple opportunities.
- Ambiguous identity (two "J. Smith") → keep separate, flag `identity_uncertain`.

**Validation Criteria.** Dedupe correctly merges known-duplicate fixtures. Ranking deterministic. On 10 sample companies, primary contact is a sane first choice per human review ≥80%.

**Future Extensions.** Auto-verify employment via public profile fetch (admission-tested, free); warm-path detection (do I already have a GitHub interaction with them).

---

## 6. Application Package Engine

**Purpose.** Generate resume variant + cover letter for Apply/Both opportunities so the human edits, not authors.

**Inputs.** `Opportunity`, `EvidenceMatch`, base resume (structured), operator profile, role description.

**Outputs.**
```
ApplicationPackage {
  resume_variant : structured doc   // reordered/emphasized base resume
  cover_letter   : string
  evidence_cited : evidence_id[]
  fabrication_check : pass|flag
  notes : string                    // what to verify before submit
}
```

**Logic.**
1. Resume variant: never invent. Reorder and re-emphasize base-resume bullets to foreground experience matching opportunity domain/tags; pull matched evidence (Engine 3) to the top of the projects section. Output is a selection+ordering over existing true bullets.
2. Cover letter: LLM drafts ≤250 words grounded strictly in base resume + matched evidence + opportunity. Structure: hook (specific to company/role) → 2 proof points citing evidence → fit + ask.
3. `fabrication_check`: post-generation pass compares every concrete claim in outputs against the base-resume + evidence inventory; any claim not traceable → `flag` + list offending sentences.

**Decision Rules.**
- If `EvidenceMatch.ranked=[]` → cover letter leads with capability + learning trajectory, explicitly no fabricated projects; `notes` warns proof is thin.
- Never assert years-of-experience or titles not in base resume.
- Tone register by category: startup = direct/builder; corporate intern = structured/credentialed.

**Edge Cases.**
- Over-claiming via LLM → caught by fabrication_check; on flag, regenerate once with the offending claims quoted as forbidden.
- Very sparse base resume → shorter letter, capability-and-evidence-led; do not pad.

**Validation Criteria.** `fabrication_check=pass` required before a package is eligible for human review. Every `evidence_cited` exists and was in the match set. Letter ≤250 words.

**Future Extensions.** A/B letter variants; learned which openings get responses (Engine 12).

---

## 7. Outreach Package Engine

**Purpose.** Generate channel-correct outreach draft referencing matched evidence. (Prompts exist; this is the assembly + constraint logic around them.)

**Inputs.** `Contact` (primary), `Opportunity`, `EvidenceMatch`, `ask_type`, `channel`.

**Outputs.**
```
OutreachDraft {
  channel, subject|null, body, word_count, char_count,
  evidence_referenced, customization_notes, constraint_pass: bool
}
```

**Logic.**
1. Select prompt by channel (email/linkedin/github/slack). Inject: contact facts, opportunity facts, top evidence asset (url + reason), ask type.
2. Enforce channel constraints post-generation:
   - email body ≤110 words; subject ≤10 words, technical, non-generic.
   - LinkedIn connect ≤300 chars; DM ≤80 words.
   - GitHub interaction must be genuinely technical (Engine routes to github prompt which can return `has_genuine_opportunity=false`).
3. `constraint_pass` = all length/format rules satisfied AND exactly one evidence asset referenced AND no banned phrases ("pick your brain", "passionate about", "just following up", "hope this finds you well").
4. On constraint fail → one regeneration with the violated constraint emphasized; persistent fail → return draft with `constraint_pass=false` for human fixing.

**Decision Rules.**
- One evidence asset per message (more dilutes). Choose `EvidenceMatch.ranked[0]`.
- GitHub channel: if `has_genuine_opportunity=false`, do not produce a forced comment; recommend a different channel in `customization_notes`.
- Opener must contain a specific technical observation about the target's work, not a greeting.

**Edge Cases.**
- No evidence → outreach references a relevant capability/contribution generally; `customization_notes` flags weakness.
- Stale target facts → `customization_notes` lists what to verify (e.g. "confirm still at company").

**Validation Criteria.** 100% of `constraint_pass=true` drafts meet length + single-evidence + no-banned-phrase rules (assertion-checked, not LLM-judged). Banned-phrase scan is a hard regex gate.

**Future Extensions.** Per-recipient tone learning; subject-line performance tracking via Engine 9.

---

## 8. Follow-Up Engine

**Purpose.** Schedule and draft follow-ups so leads don't die; terminate cleanly.

**Inputs.** `Outreach` record (sent_date, channel, status), original draft, optional new evidence/context.

**Outputs.**
```
FollowUpState {
  outreach_id, step(0..3), next_due: date|null,
  draft: OutreachDraft|null, terminal: bool
}
```

**Logic — state machine.**
```
state: step ∈ {0=sent, 1=FU1, 2=FU2, 3=FU3, done}
schedule: FU1 = sent+4d, FU2 = FU1+6d (sent+10), FU3 = FU2+7d (sent+17)
on response received at any step → terminal=true, status=Replied, cancel pending
on reaching FU3 sent with no reply → terminal=true, status=No-Response
```
Draft rules per step:
- FU1 (≤60w): add NEW value (recent PR/article/insight). No "just following up".
- FU2 (≤50w): different angle; reference something they shipped/posted; a question (easier to answer).
- FU3 (≤40w): final, graceful, door open, no guilt.

**Decision Rules.**
- LinkedIn no-reply after FU1 → switch channel to email for FU2 if email known (`channel_switch` note), rather than repeat on a dead channel.
- Never exceed 3 follow-ups. Hard cap.
- OSS/LFX context: post-application follow-ups suppressed (process-owned); engagement is pre-application on GitHub instead. Engine checks `opportunity.category==OSS && status==applied` → no follow-up schedule.

**Edge Cases.**
- Response arrives between schedule and send → pending follow-up must be cancelled (check status immediately before any send).
- Contact bounced/invalid → terminal, status=Bounced, do not continue.

**Validation Criteria.** Due dates compute exactly per formula. No path sends >3 follow-ups. Response always halts the sequence. Word caps enforced by assertion.

**Future Extensions.** Optimal-interval learning by channel/persona; auto-detect replies via inbox parsing (post-approval, free).

---

## 9. Source Performance Engine

**Purpose.** Quantify which sources produce responses → interviews → offers → income, so effort concentrates.

**Inputs.** `Outcome` events: `{type ∈ (discovered, qualified, sent, response, interview, offer, income), opportunity_id, source_name, amount?, date}`.

**Outputs.**
```
SourceReport[] per source {
  discovered, qualified, sent, responses, interviews, offers,
  income_total,
  rates { qualify=qualified/discovered, response=responses/sent,
          interview=interviews/responses, offer=offers/interviews },
  sample_size, low_confidence: bool
}
```

**Logic.**
1. Aggregate events grouped by `source_name`.
2. Compute funnel counts then ratio metrics. Guard divide-by-zero (0 denominator → rate=null, not 0).
3. `low_confidence=true` when `sent < 10` (rates unstable on small samples).
4. Rank sources by a composite only when not low_confidence: primary key = income_total, secondary = response_rate.

**Decision Rules.**
- Never declare a source "bad" while `low_confidence`. Charter optimizes for income/responses, not for premature pruning.
- Income counts at the source that *originated* the opportunity (see Engine 10 attribution).

**Edge Cases.**
- Source with discoveries but zero sent → shows as "untapped", not "failed".
- Multi-source opportunity (seen in several) → counted under the originating source only, to avoid double credit.

**Validation Criteria.** Counts reconcile with raw event log (sum check). Rates null when denominator 0. Deterministic given event set.

**Future Extensions.** Time-windowed reports (last 90d vs lifetime); cost-per-response if any paid source is ever admitted.

---

## 10. Income Attribution Engine

**Purpose.** Tie money back to source → opportunity → outcome. The root objective, measured.

**Inputs.** `income` outcome events `{opportunity_id, amount_inr, kind ∈ (freelance|salary|bounty|stipend), recognized_date}` + the opportunity's lineage (source, contacts touched).

**Outputs.**
```
AttributionRecord {
  opportunity_id, source_name, kind, amount_inr,
  first_touch_source, last_touch_channel, recognized_date
}
AttributionRollup per source { total_inr, count, avg_inr }
```

**Logic.**
1. Single-touch default: credit the opportunity's originating `source_name` (first_touch). Simple, robust for a solo operator.
2. Record `last_touch_channel` (the channel that produced the reply leading to income) for channel-level insight, but do not split credit (avoids fractional-attribution complexity that adds no decision value at this scale).
3. Recurring income (freelance retainer) → one AttributionRecord per recognized payment, same opportunity_id; rollup sums them.

**Decision Rules.**
- Attribution is first-touch-source for rollups, with last-touch-channel retained as metadata. Documented choice; revisit only if multi-touch ever changes a real decision.
- Equity/deferred comp → not counted as income until realized; tracked separately as `pipeline_value`, never mixed into income_total.

**Edge Cases.**
- Income with no clear originating opportunity (inbound referral) → source=`network`, opportunity created retroactively so lineage exists.
- Refund/clawback → negative AttributionRecord to keep totals truthful.

**Validation Criteria.** Σ AttributionRecord.amount == Σ income events. Rollups reconcile. Negative/refund handled without breaking averages.

**Future Extensions.** Multi-touch model *only if* data ever shows single-touch misleads a decision; ROI per source once any cost exists.

---

## 11. Discovery Source Admission Framework

**Purpose.** Gate which sources enter automated discovery so cost/maintenance constraints hold. A source is admitted only if it passes all checks.

**Inputs.** `SourceProposal { name, type, ingestion_method(rss|api|email_alert|scrape), auth_required, est_volume_per_week, est_maint_min_per_week, cost_per_month_inr }`.

**Outputs.** `AdmissionDecision { admit: bool, failed_checks: string[], probation: bool }`.

**Logic — all checks must pass.**
```
[ ] cost_per_month_inr == 0   OR  (justified by measured income from a prior manual trial)
[ ] ingestion_method ∈ {rss, api, email_alert}     # scrape only allowed on probation
[ ] est_maint_min_per_week <= 10
[ ] has_health_check == true                        # detects silent breakage
[ ] dedupe_compatible == true                       # emits fields for fingerprinting
[ ] survives_format_change == true                  # partial failure, not total silent stop
```
- `scrape` method → `admit=true` only as `probation=true` (extra monitoring, first to be cut if it breaks).
- Total automated-source maintenance budget enforced globally: Σ admitted `est_maint_min_per_week` ≤ 50 (keeps whole discovery layer under ~1hr/wk with margin). New admission that would breach the budget is rejected even if individually passing.

**Decision Rules.**
- One source admitted at a time; a new proposal waits until the previous admitted source has run clean for 2 weeks.
- A paid source needs a documented manual-trial income result to override the ₹0 default, and total cost stays ≤₹100/mo.

**Edge Cases.**
- Source passes then degrades (format change) → health check flips it to `probation`; two consecutive failed health checks → auto-disable + weekly-report alert, fall back to Stage-1 manual for that source.
- Volume spike floods pipeline → rate-limit ingest; scoring gate protects downstream.

**Validation Criteria.** No admitted source violates cost/maint budgets (assertion on global sums). Disabled-on-breakage path tested with a simulated format change.

**Future Extensions.** Auto-discovery of new sources from where income actually came (Engine 12 → propose sources).

---

## 12. Long-Term Opportunity Intelligence Layer

**Purpose.** Use accumulated outcomes to re-weight discovery and recalibrate scoring — the system learning where leverage is. Read-only analysis with guarded, human-approved feedback.

**Inputs.** Historical `Score` vs `Outcome` pairs, `SourceReport[]`, `AttributionRollup`, evidence-cited-vs-response data.

**Outputs.**
```
IntelligenceUpdate {
  source_weight_suggestions : [{source, current, suggested, basis}]
  scoring_calibration       : [{factor, observation, suggested_adjustment}]
  evidence_signal           : [{evidence_id, response_correlation}]
  source_proposals          : string[]      // new sources to consider
  applied : false                            // ALWAYS requires human approval
}
```

**Logic.**
1. Minimum-data gates (no action below threshold): source weighting needs ≥20 sent and ≥5 responses for that source; scoring calibration needs ≥30 scored+resolved opportunities; evidence signal needs ≥15 outreach with cited evidence.
2. Source weighting: compare each source's response/offer/income rates to the mean; suggest up/down weight proportional to deviation, bounded (±20% per cycle) to prevent thrash.
3. Scoring calibration: for each factor, correlate factor value with downstream response; if a factor has near-zero correlation across a large sample, suggest down-weighting it (and vice-versa).
4. Evidence signal: which cited assets correlate with replies → informs Engine 3 weighting and flags assets to retire/expand.
5. All outputs are *suggestions*. `applied=false` always; a human reviews and explicitly accepts before any weight/rubric change is written. Judgment stays human (charter).

**Decision Rules.**
- Never auto-apply. The layer proposes; the operator disposes.
- Bounded adjustments per cycle; no single cycle can swing a weight more than ±20% or flip a tier threshold by more than 3 points.
- Below min-data → emit "insufficient data", suggest nothing. Avoids overfitting to noise.

**Edge Cases.**
- Confounded signal (a great source had one lucky offer) → bounding + min-sample dampen; flag as `low_confidence_signal`.
- Seasonality (hiring cycles) → prefer trailing-window comparisons once enough history exists; until then, lifetime only with a caveat.

**Validation Criteria.** No suggestion emitted below its data gate. No suggested change exceeds bounds. `applied` is never true without a logged human approval event. Back-test: applying past suggestions would not have inverted a known-good source ranking.

**Future Extensions.** Trailing-window + seasonality models; source-proposal automation feeding Engine 11; per-category scoring models.

---

## CROSS-ENGINE INVARIANTS

- Every LLM output is schema-validated before any Airtable write; on failure, retry-once-then-degrade with explicit low-confidence flag. No silent bad writes.
- No engine sends anything. Execution is post-approval only (Engine boundary respected).
- Determinism: all rule-based computations reproduce exactly on fixed input; only LLM-judgment factors may vary, and those are bounded/clamped.
- Banned-phrase and fabrication gates are hard regex/trace checks, never LLM self-judgment.
- Every money and outcome number reconciles to the raw event log (sum checks are part of validation).
