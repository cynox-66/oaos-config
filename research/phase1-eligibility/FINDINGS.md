# Phase 1 Eligibility Research — FINDINGS

**Date:** 2026-08-06. Research/specification session. No production code, no
commits, no preferences.json writes, no source enabled, zero Gemini calls.
Track documents (the evidence; this file synthesizes, it does not re-paste):
`track1-geo.md`, `track2-duplicates.md`, `track3-roletype.md`,
`track4-providers.md`, `track5-specs.md`. Analysis scripts:
`replay-analysis.ts`, `term-counts.ts` (offline, replayable). Raw captures:
`raw/`.

---

## 1. Executive summary — what is true, by how much it matters

1. **Geo is confirmed as the binding constraint, and it is worse than the
   session premise: 25 of 25 items in the current passed set are
   geo-ineligible for the operator.** Measured by replaying the exact
   2026-08-06 corpus (replay reproduces 446→324→25 identically). The entire
   four-board India-eligible slice is 8 explicit + 3 unresolved items of 324;
   after prerank, ~4 pass, 3 of them GTM roles. Every Gemini rupee spent on
   discovery in the past week bought approximately zero actionable output.

2. **The fix is cheaper than assumed: the geo signal is already in the data
   OAOS fetches.** Greenhouse `location.name` is populated 446/446 and names
   the hiring country on every one of the six operator-verified ineligible
   postings; Himalayas' `locationRestrictions` re-verified best-in-class
   (96% populated, unambiguous empty-array worldwide, 0/19 field-vs-prose
   disagreements). Nothing structural blocks filtering — OAOS discards a
   signal the sources supply. Same shape as the 2026-08-05 `content`-key
   defect.

3. **Regional duplicates (P3) are a symptom of geo, not a separate disease.**
   45 sibling groups hold 145 of the 324 deduped items (100 wasted slots;
   13 of the passed 25). A geo filter dissolves ALL of them on the measured
   corpus — no group has an India-eligible member, and single-country
   eligibility collapses per-country siblings by construction. A dedupe fix
   built first would be wasted work (Track 2d, Amendment C: hypothesis holds).

4. **Role-type contamination (#25) is real at both layers but
   second-order.** Prerank cannot discriminate (GTM roles match 7–11
   vocabulary terms vs engineering's 8–15 — overlapping ranges, no
   discriminating term), and Engine 2 does not catch the sales-engineering
   tier: Chainguard Partner SE scored T60 — the #2 record in the whole
   table, above every automated engineering record. But geo filtering
   removes 4 of the 5 currently-passed GTM roles, so role-type sequences
   after geo.

5. **The source estate is inverted relative to the constraint.** The
   activated source (4 US/EU remote-first Greenhouse boards) is measured at
   ~0–1 eligible engineering roles per run. The geo-clean or geo-filterable
   capacity — Himalayas (11% eligible, built, admitted, disabled), Red Hat
   Workday (19 remote-India, built, disabled), SigNoz Ashby (built,
   disabled), Adzuna (India by construction, credentialed), the OSS
   mentorship calendar track — is all idle.

6. **A3 is settled by measurement:** Adzuna's 4-token query collapses to 0
   on all 6 probed terms (never enable A3 with Adzuna in the composition);
   Himalayas' modifier in isolation never collapses (re-ranks its fixed
   top-20; totalCount tightens 85–89% on broad terms, page size unchanged).

7. **One session premise did not survive contact with the record:** no
   Internshala / India-platform rejection exists anywhere in the repo. The
   closest artifacts (D5 Naukri deferral, Arbeitnow rejection) were never
   quality-based. Reported as a gap, not re-litigated (Track 4b).

## 2. Cross-track synthesis — how P1/P2/P3 interact, and the sequencing that falls out

P1 (geo) → P3 (duplicates): per-country requisitions are ONE publishing
mechanism producing both problems; filtering on the geo field collapses the
duplicates as a side effect (measured: 45/45 groups dissolve). P1 → P2
(role type): 4 of 5 passed GTM roles are non-India; the post-geo residual is
small (3 India-GTM items today) and is the number R2 should be judged
against, not today's pre-geo contamination. Therefore the sequence that
falls out of the measurements, not preference:

**G1 (geo scope dimension + per-source mapping + orchestrator filter,
Greenhouse-inclusive) → Himalayas activation → watch D1/R1 reopen triggers
in run summaries → R2 (title-scoped role-type exclusions) only if the
post-geo residual justifies it → S1 (freehire request-side) only on
measured page waste.** One schema decision must be made BEFORE the G1 build:
whether R2's `role_types` section rides the same v3 bump (avoiding a v4
re-confirmation later) — ruling question Q4.

A consequence worth stating for Wave-8 economics: with G1 active, a
Greenhouse-only run feeds prerank ~11 items, not 324 — runs get cheaper and
`maxPerRun` stops binding (which also re-opens #23's k-scoped measurement if
`maxPerRun` is ever raised to compensate).

## 3. NOT OBSERVABLE — with exactly what would settle each

- **Whether Himalayas' search endpoint honors a geo request param.** One
  probe pair (`q=X` vs `q=X&country=India`-style variants). Response-side
  filtering makes this optional.
- **Himalayas empty-array false-negative rate beyond n=2.** A larger sample
  of worldwide postings cross-read against descriptions (~10 requests).
- **Lever/Ashby/Workday geo field shape.** One fetch each of a real board
  (Sysdig, SigNoz, Red Hat) — needed before G1's `map.ts` covers them;
  G1 ships them as `unknown_source` until then (~4 requests total).
- **freehire resolver precision** (is `countries` ever wrong vs merely
  missing) — per-posting click-throughs; deferred.
- **India job-platform automatable mechanisms** (Internshala/Naukri/
  Instahyre public endpoints + ToS) — a Phase-0-style bounded probe session;
  prerequisite for any ruling on that category.
- **Combined Greenhouse+Himalayas prerank mix under geo filtering** —
  computable OFFLINE from this session's captures plus one Himalayas
  13-term fetch set; no new mechanism needed.
- **Run-level corpus membership in production** (noted in the seniority
  wave): `runStage3` returns counts only; the record/replay harness remains
  the observation tool until the orchestrator exposes fingerprints (out of
  scope, unchanged).

## 4. OPERATOR RULING QUESTIONS

**Q1 — Build the geo dimension, and in which shape?** Hinges: everything in
§2. Evidence: Tracks 1, 2d, Amendment A (population 100%, vocabulary census,
0 prose disagreements; 25/25 ineligible today). Selects: **G1**
(Greenhouse-inclusive — my recommendation) vs **G2** (Himalayas-only,
transitional Greenhouse status quo) vs **G3** (prerank-site, rejected in
analysis) vs none. Also selects D1 implicitly (no dedupe work) — reopening
trigger stated in track5 D1.

**Q2 — Unresolved-geo policy default: `"pass"` or `"gate"`?** Hinges: which
direction the filter fails when a value cannot be parsed (~4% of Greenhouse
values; freehire's 24% unresolved slice; unmapped sources). Evidence:
Amendment A tail census; freehire "missing = not resolved". Track 5 proposes
`"pass"` (fail-open, surfaced) as the proposal default; the operator confirms
per D15 either way.

**Q3 — Frozen-territory authorization for the G1 build:** scope module files
(types/loader/reducer/baseline, v2→v3 with the stated rejection message).
Prerank: zero lines. Engines/pipeline/persistence: zero lines. The build
session may not start without this ruling.

**Q4 — Does R2 (role-type exclusions) ride the same v3 schema bump?**
Hinges: one re-confirmation vs two (v4 later). Evidence: Track 3 (Partner SE
T60 = #2 record; post-geo residual = 3 India-GTM items today). My
recommendation: decide the schema shape now, ship the section
all-unexcluded (behaviour-neutral) even if the gate itself builds later.

**Q5 — Himalayas activation** (pairs with G1). Evidence: Track 4c readiness
(14 req/run, ~11% eligible rate, trustworthy geo field, no Wave-5
divergence, literal-HTML content path). Protocol: `ACTIVATED_SOURCES` +
`enabled: true` same-commit.

**Q6 — A3 disposition.** Evidence: Track 4d — Adzuna composition
collapses to zero (must be excluded from the modifier before A3 can ever
enable); Himalayas is safe in isolation. Options: leave A3 off (status
quo); or authorize the one-line Adzuna exclusion so A3 becomes enableable
for Himalayas/freehire only. Note freehire's `seniority` facet (junior/
intern) is an unprobed request-side alternative that may be strictly better
than a text modifier there.

**Q7 — Source-mix direction beyond this wave** (no spec attached; shapes
Wave 7/8 planning). Evidence: Track 4a table. Candidates in descending
readiness: Himalayas (Q5), Workday/Red Hat activation (24 req/run cost,
19 remote-India), Ashby/SigNoz activation, registry expansion with an
India-presence lens (yc-oss feeder), India-platform probe session
(prerequisite ruling: spend a probe budget at all).

**Q8 — Records hygiene:** the 2026-08-06 run wrote ineligible GTM records
(Partner SE T60 sits at #2 in the table; 25 records now known
non-actionable). Decide: leave as history, or clear via the row-delete
protocol (the 08-02 lesson: "Delete records", not cell-clear) before the
next verification run — affects the G1 live-verify baseline.

## 5. Probe ledger — every live request

| source | requests | cap | what |
|---|---|---|---|
| Himalayas | **9** | 20 | 3 search (track 1 field census) + 6 A/B (track 4d modifier isolation) |
| Greenhouse | **5** | 8 (+12 Amendment A, unspent) | 4 board fetches `content=true` + 1 per-job `questions=true` |
| Adzuna | **13** | 15 | 1 response-shape (track 1) + 12 A/B (track 4d 4-token probe) |
| freehire | **1** | 12 | 1 search (track 1 response geo fields) |
| Remotive | **1** | 1 | 1 listing (track 1 field census) — the UTC-day budget, spent |
| HN | 0 | — | answered from recorded findings (labeled inferred) |
| **Total** | **29** | 60 | |

Plus 1 read-only Airtable REST call (persisted scores, Track 3b) —
persistence access, not a discovery probe; listed for completeness. No other
network I/O. Amendment A's extra Greenhouse budget was not needed: the
full-board analysis ran off the Track-1 captures.
