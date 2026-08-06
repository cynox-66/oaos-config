# G1 Step 2 — status at the operator-block point (2026-08-06)

Branch: `feat/geo-eligibility` (uncommitted working tree; commit is Step 3).
Suite: **1120 passed / 83 files** (main baseline re-measured in a clean
worktree this session: 1030/78 — CLAUDE.md's figure confirmed). Delta: +90
tests, +5 files.

## Implemented (per the approved Step-1 plan)

- Schema v3: `Preferences.geo` (GeoPreference | null) + `Preferences.role_types`
  (all-unexcluded schema, gate NOT built — Q4). `PREFERENCES_VERSION = 3`.
- Q4 resolution as planned: role_types validator requires NO completeness
  (config may gain ids without invalidating files); unknown/duplicate ids,
  non-member terms, excluded-with-no-terms all reject. Rationale recorded in
  types.ts + role-types.ts against future "fixing".
- Q2 correction honored: `unknown_source` is a distinct GeoStatus, ALWAYS
  passes under both `unresolved` policies, named loudly in the run summary.
- Migration: v2 consumption rejection uses the exact ruled message (smoke-
  verified against the operator's real v2 file via `oaos discover --stage3`);
  `parseBaseline` carries v2 ticks/seniority with geo/role_types undefined.
- Reducer: `geo add/remove/worldwide/unresolved/off/on`, `rt<n>`,
  `adopt rt<n>`; `done` refuses on active-but-empty geo naming both exits;
  `buildPreferences` stamps both sections (sole constructor, unforgeability
  unchanged).
- `src/discovery/geo/`: countries/cities/regions vocabulary (membership only),
  per-source mappers (greenhouse, himalayas, freehire, remotive, adzuna;
  everything else unknown_source), partition with in-module sum invariant.
- Orchestrator: filter between dedupe and prerank; per-source + run-level geo
  counts; `geo` null/undefined ⇒ byte-identical pre-G1 behaviour (tested).
- CLI: stage3 passes `preferences.geo`; run summary gains the Geo block with
  loud unknown-source naming; setup-scope renders/edits both new sections.

Deviations from the Step-1 plan, stated: (1) `offices[]` corroboration for
bare-city location.name was NOT implemented — the city table (census-derived)
resolves every observed case; offices stay unread (fewer moving parts, and
Track 1b measured offices occasionally stale). (2) No per-source geo columns
in the summary TABLE — counts live in the run-level Geo block + the summary
object (table width). Both are reportable simplifications, not scope changes.

## Replay verification (0 requests) — real `runStage3` over the captured bytes

- **Control (geo: null):** 446 fetched → 122 deduped → prerank 324 in →
  **25 passed** — reproduces the recorded corpus exactly. gatedByReason:
  negative_term 172, below_floor 48, beyond_k 79.
- **Geo arm (IN / worldwide ok / pass):** geo block
  `{total: 324, eligible: 8, ineligible: 315, unresolved: 1, unknownSource: 0}`
  → prerank 9 in → **4 passed**, 5 gated (ALL `negative_term` — the senior/
  principal-titled India roles). Passed set: Partner Solutions Architect -
  India, Enterprise AE - Mumbai, Solutions Architect - India (Bangalore),
  Partner Sales Director-India. Duplicate groups in passed set: **0** —
  Track 2d's dissolution prediction holds in the shipped path.
- Divergence from the Track-2 research classifier, explained: the shipped
  mapper resolves the two Tailscale Vancouver-hybrid items to CA/ineligible
  (research called them unresolved) → 315/1 vs 313/3, and those two items
  moved from below_floor to geo-ineligible. Stricter in the safe direction;
  the only unresolved item is ClickHouse's bare `"(Remote)"`.

## The two ruled regime observations (measured, NOT acted on)

1. **IDF denominator:** the homogeneous fallback does **NOT fire** in either
   arm. Control: 152 scored, maxAchievable 46.41, no idf-0 terms. Geo arm:
   4 scored, maxAchievable 2.78 (> 0, so IDF stays active) — but **3 of the
   9 present terms (observability, data, platform) sit at idf = 0** and
   contribute nothing to ranking. IDF is active but partially degenerate at
   this batch size; ranking rests on the remaining 6 terms.
2. **Gate regime:** `maxPerRun` stops binding as predicted (beyond_k 0), but
   below_floor did NOT become the operative gate on this corpus — the
   **seniority negative gate** is (5 of 5 gated items). below_floor 0. The
   Track-2d expectation (7 below_floor) came from the research classifier's
   unresolved Vancouver items; with the shipped mapper they exit via geo.
   Nothing was adjusted in response (report-don't-tune).

Step-3 note (per ruling): #23's "correct at k=25" seniority measurement is
scoped to a condition G1 removes — unmeasured at the new regime, to be
recorded in the wave entry.

## Live verification (after the operator's v3 re-confirmation, 2026-08-06)

preferences.json re-confirmed by the operator via a real `oaos setup-scope`
(v3, 13 fields, all five seniority levels excluded, geo IN/worldwide-ok/pass,
role_types all unexcluded — verified read-only via `--show` before running).

**Greenhouse dry-run (`--source greenhouse --dry-run`, 8 requests):**

```
greenhouse         446    0    122       4      5        0  ✓ healthy
Geo: 324 in → 8 eligible, 315 ineligible, 1 unresolved (passed)
Prerank: 9 in → 4 passed, 5 gated (negative_term 5)
```

**Byte-identical to the replay arm on every count** — the captured-bytes
replay and the live API agree, so the mapper's value census is current.

**Himalayas dry-run (`--source himalayas --dry-run`, 14 requests — a
`--source` activation gesture, NOT an activation; sources.ts untouched):**

```
himalayas          225    0     25       7     13        0  ✓ healthy
Geo: 200 in → 18 eligible, 180 ineligible, 2 unresolved (passed)
Prerank: 20 in → 7 passed, 13 gated (negative_term 12, location 1)
```

18/200 eligible (9%) — consistent with Track 1's 11% sample estimate. The
7 passed are geo-eligible, seniority-clean Himalayas postings — the first
run in OAOS history whose entire passed set is plausibly actionable.

**False-positive audit (0 requests):** the shipped mapper over the Track-1
Himalayas capture (56 postings) classifies 6 eligible / 50 ineligible /
0 unresolved — exactly the hand-derived Track-1 set (4 India incl. the
11-country VEXXHOST list, 2 explicit-worldwide), zero India/worldwide
postings wrongly gated, and the Hostaway 148-country EMEA list fully
resolves to ineligible (membership, not length).

**Step-2 request ledger: 22 live requests** (Greenhouse 8 = 4 boards × 2
per #16; Himalayas 13 + 1 healthCheck). Zero Gemini. Zero writes (dry runs
persist nothing — health.json/calendar.json untouched).

## STEP 2 COMPLETE — paused for operator review before Step 3
(Step 3: scope README/CHANGELOG + CLAUDE.md wave entry incl. the #23
"unmeasured at the new regime" note, diff-manifest audit, suite re-run,
HOLD AT COMMIT.)
