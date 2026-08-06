# G1 — Step 1 build plan (geo eligibility dimension, schema v3)

**Date:** 2026-08-06. Successor artifact to `track5-specs.md` SPEC G1, under
the operator's FINDINGS §4 rulings (Q1–Q8, received 2026-08-06). Pause-gate
pattern: **this document is Step 1 → PAUSE for approval; Step 2 implements +
bounded live verification → PAUSE; Step 3 finalizes, holds at commit.**

## Rulings this plan is bound by

- **Q1:** G1 — Greenhouse-inclusive, schema v3.
- **Q2:** `unresolved: "pass"` proposed default; **`unknown_source` is a
  separate class that ALWAYS passes, reported separately and loudly,
  independent of the unresolved policy.**
- **Q3:** scope module (types, preferences loader, reducer, baseline,
  setup-scope CLI) authorized for v3. `src/discovery/prerank/`: ZERO LINES.
  12 engines, pipeline, persistence: ZERO LINES. Diff manifest re-asserted
  here (below) and verified at Step 3.
- **Q4:** `role_types` schema folds into v3, ships all-unexcluded, gate NOT
  built. Conditional resolved in §4 below: **it can be done cleanly.**
- **Q8:** table records untouched; verification is replay + dry-run, zero
  writes.
- Standing: drift discipline, no investigative logging, preferences.json
  read-only to the build session (only a real `oaos setup-scope` run by the
  operator may write it), report-don't-tune, push claims verified by
  `git fetch origin main` + matching `git rev-parse main origin/main`.

---

## 1. Schema v3 — the exact persisted shape

`PREFERENCES_VERSION` 2 → 3. Two new top-level sections on `Preferences`:

```ts
// ── Geo (v3) ── src/discovery/scope/types.ts
export interface GeoPreference {
  /** ISO-3166 alpha-2, UPPERCASE, deduped, non-empty when section active. */
  eligible_countries: string[];
  /** Explicitly-unrestricted postings (Himalayas empty-array, Remotive
      "Worldwide", freehire regions:["global"]) count as eligible. */
  worldwide_ok: boolean;
  /** Mapper-ran-but-could-not-parse policy. "pass" ⇒ kept, surfaced as
      geo_unresolved. "gate" ⇒ dropped, reported. unknown_source is NOT
      governed by this flag — it always passes (Q2). */
  unresolved: "pass" | "gate";
}

export interface Preferences {
  version: 3;
  // …existing fields/work_types/remote_only/seniority unchanged…
  /** null ⇔ the operator explicitly confirmed `geo off`: dimension
      confirmed-absent, filter disabled, discovery behaves exactly as v2.
      A DECISION, not a default — the reducer refuses `done` on an
      untouched empty geo section. */
  geo: GeoPreference | null;
  /** Q4: schema ships now, gate ships later. All-unexcluded ⇒ behaviour-
      neutral. */
  role_types: RoleTypeSelection[];
}

// ── Role types (v3, schema only) ──
export type RoleTypeId =
  | "account_executive" | "sales_development" | "marketing"
  | "customer_success" | "recruiting" | "solutions_engineering"
  | "partner_engineering";
export interface RoleTypeSelection {
  id: RoleTypeId;
  excluded: boolean;   // all false at v3 ship
  /** Persisted expanded terms, same negative-gate rationale as seniority
      (SeniorityLevelSelection docs). Must be non-empty when excluded. */
  terms: string[];
}
```

`ScopeBaseline` gains `geo: GeoPreference | null | undefined` and
`role_types: RoleTypeSelection[] | null` (null when the file predates v3),
mirroring the seniority v1 handling.

## 2. Migration and validation (`preferences.ts`)

- **Consumption path** (`parsePreferences`/`loadPreferences`): strict
  `version: 3`. A v2 (or v1) file throws the outdated-version error with the
  Q-ruled message:

  ```
  preferences.json is version 2; this build requires version 3 (adds the geo
  eligibility section). Run `oaos setup-scope` to re-confirm your scope —
  your confirmed fields and seniority choices will be carried forward and
  you will be asked to confirm the new geo section.
  ```

  (v1 keeps its existing seniority-era message chain — oldest applicable
  message wins; implementation: version < 3 dispatches on the found version.)
- **Baseline path** (`parseBaseline`/`loadBaseline`): version-tolerant 1–3;
  `geo`/`role_types` parsed only when `version >= 3`, else null. This is the
  seniority split reused, not re-invented — no new loader.
- **Geo validation (strict, on read AND write, never coercing):**
  - `eligible_countries`: array of exact `/^[A-Z]{2}$/` strings, non-empty,
    no duplicates — reject naming path + offending value. (Membership in the
    geo module's country table is NOT required — ISO shape is the contract;
    an unknown-but-valid code merely never matches.)
  - `worldwide_ok`, `unresolved`: exact types/values.
  - `geo: null` valid (confirmed-off).
- **role_types validation — the Q4 resolution (§4):** unknown `id` →
  reject; duplicate `id` → reject; `terms` ⊄ that id's config term union →
  reject naming term; `excluded: true` with empty `terms` → reject;
  **completeness NOT required** — a file missing a config id is valid.

## 3. Reducer + setup-scope CLI

New `ScopeState.geo: GeoSectionState` where
`GeoSectionState = { countries: string[]; worldwide_ok: boolean; unresolved:
"pass" | "gate"; touched: boolean; off: boolean }`.

Proposal (fresh derivation): `countries: []`, `worldwide_ok: true`,
`unresolved: "pass"`, `touched: false`, `off: false`. Baseline re-run: carry
the persisted geo (or off-state) forward, `touched: true` (ticks always win).

New commands (parseScopeCommand) → actions (reduceScope, total, never
throws; inapplicable ⇒ unchanged state + notice):

| command | action |
|---|---|
| `geo add <cc>` | add ISO code (uppercased; invalid shape ⇒ notice) |
| `geo remove <cc>` | remove (absent ⇒ notice) |
| `geo worldwide on|off` | set `worldwide_ok` |
| `geo unresolved pass|gate` | set policy |
| `geo off` | dimension confirmed-absent (clears countries, sets `off`) |
| `geo on` | undo `off` |
| `rt<n>` / `roletype <id>` | toggle role-type exclusion (schema ships; toggling is ALLOWED at setup time — the gate just doesn't exist yet, and the validator accepts excluded entries; render notes "gate not yet built") |
| `rt adopt <id>` | adopt `<NEW TERMS>` for a role type (seniority `adopt` pattern) |

`confirm` (`done`) refusal rule: `!touched && !off && countries.length === 0`
⇒ notice "the geo section is new in v3 — add your eligible countries
(`geo add IN`) or explicitly disable it (`geo off`) before `done`."
Any geo command sets `touched`.

`buildPreferences`: stamps `geo` (null when `off`) and `role_types` from
state; unchanged confirmation gate (throws unless `status === "confirmed"`)
— unforgeability extends to both sections with zero new mechanism.

Render: a GEO section (countries, worldwide, unresolved, `<NEW IN v3>`
marker until touched) and a ROLE TYPES section listing config types with
tick state + `<NEW TERMS>`/`<NEW>` markers (new ids from future config
gains surface here — §4).

## 4. Q4 conditional — RESOLVED: role_types tolerates config gaining ids cleanly

**The seniority invariant** (`parseSeniority`, preferences.ts:205-209)
rejects a file missing any `SENIORITY_LEVEL_IDS` member ("all 5 levels must
be present"). If `role_types` inherited it, config gaining an 8th id would
invalidate every v3 file — forcing exactly the re-confirmation the Q4 fold
exists to avoid.

**role_types does NOT inherit it, and this is principled, not lax:** for an
exclusion gate, ABSENCE of an id can only mean "never confirmed, therefore
never gated" — the fail-open, behaviour-neutral default that under-proposing
prescribes. A config-gained id changes nothing for existing files (no gating
without confirmation — D15 intact), and surfaces as `<NEW>` at the next
`setup-scope`, adoptable only by an explicit toggle — exactly the mechanism
seniority already uses for config-gained TERMS, promoted one level to ids.
What stays strict: unknown ids, duplicate ids, non-member terms,
excluded-with-no-terms — all reject loudly. Seniority's own completeness
invariant is left untouched (its 5-level set is closed by design; no reason
to relax something already shipped).

**Why seniority needed completeness and role_types doesn't:** seniority's
five levels were proposed-and-confirmed as a COMPLETE decision surface in
one wave; role_types is explicitly designed for config growth across waves.
The invariant difference is the design difference, recorded here so a future
session doesn't "fix" the asymmetry in either direction.

## 5. Geo module — `src/discovery/geo/` (new, outside all frozen trees)

Per SPEC G1 §1(b) with the Q2 correction applied:

- `types.ts` — `GeoSignal = { status: "eligible" | "ineligible" |
  "unresolved" | "unknown_source"; countries: string[]; raw: string }`.
- `countries.ts` — name→ISO vocabulary + aliases from the Track-1 census
  ("Republic of Ireland", "UK", "USA", "The Netherlands", "Mainland
  China", …), city→country table (~13 entries from the ClickHouse census),
  region tokens (EMEA/Europe/APAC/NORAM/LATAM/CIS → closed country-set
  membership tables). **Membership tests only — no length heuristics**
  (Hostaway finding, encoded as a property test).
- `map.ts` — `geoOf(sourceName, item, geo): GeoSignal`; per-source branches
  exactly as specced (greenhouse `location.name` authoritative + offices
  corroboration for bare-city only; himalayas `locationRestrictions` with
  empty-array = explicit-worldwide; freehire `countries`/`regions` with
  empty = unresolved-not-worldwide; remotive alias parse with "Worldwide"
  sentinel; adzuna constant-eligible; everything else `unknown_source`).
- `filter.ts` — `partitionByGeo(items, sourceOf, geo)` → `{ eligible,
  ineligible, unresolved, unknown }` with the sum invariant enforced
  in-module (throws if partitions ≠ input — prerank's nothing-dropped
  pattern).
- `index.ts`, `tests/` (fixtures lifted from `research/phase1-eligibility/
  raw/` value census — real captured strings, not invented ones; #21).

## 6. Orchestrator + CLI wiring

- `orchestrator/types.ts`: `Stage3RunDeps.geo?: GeoPreference | null`;
  `SourceRunSummary` gains `geoIneligible`, `geoUnresolved`, `geoUnknown`
  counts; `Stage3RunSummary.geo` block (totals + policy in effect).
- `orchestrator/orchestrator.ts`: after the fingerprint-dedupe loop and
  before "2. Prerank the whole run's batch": when `geo` is a non-null
  GeoPreference, partition `pipelineItems` via the geo module using the
  existing `owner` map for per-source attribution; `eligible` (+`unresolved`
  under "pass", +`unknown` always) proceed to prerank; counts recorded per
  source. `geo` null/undefined ⇒ filter disabled, byte-identical behaviour
  to today (the v2-compat semantics of `geo off`).
- `cli/commands/stage3.ts`: `loadScope` already returns `Preferences`
  (v3-strict via `loadPreferences` — the v2 refusal happens HERE, which is
  the Q2-ruling-compatible place: no preferences ⇒ no Stage 3, now
  "no v3 preferences ⇒ no Stage 3"); pass `preferences.geo` through.
- `cli/format.ts`: run-summary table gains geo columns; a `geo` line under
  the prerank block ("geo: 313 ineligible / 3 unresolved (pass) / 0 unknown-
  source"); unknown-source count rendered on its own line NAMING the
  unmapped sources when > 0 (Q2: "reported separately and loudly").
- `cli/commands/setup-scope.ts`: render + prompt loop for the two new
  sections (thin shell over the reducer, no new I/O).

## 7. Diff manifest (re-asserted per Q3; Step 3 verifies `git diff --stat` matches)

| file | change | authorization |
|---|---|---|
| `src/discovery/scope/types.ts` | +GeoPreference, +RoleType*, Preferences v3, ScopeBaseline ext., ScopeState/Action/Command ext. | Q3 |
| `src/discovery/scope/preferences.ts` | v3 parse/validate both sections, v2 rejection message, baseline tolerance | Q3 |
| `src/discovery/scope/reducer.ts` | geo + role_types actions, confirm-refusal rule, buildPreferences stamping | Q3 |
| `src/discovery/scope/generator.ts` | propose geo (empty/on/pass) + role_types (config, unexcluded) with baseline carry-forward | Q3 |
| `src/discovery/scope/config.ts` or new `role-types.ts` | ROLE_TYPE config (closed id set + term expansions) | Q3 |
| `src/discovery/scope/index.ts` | exports | Q3 |
| `src/discovery/scope/{README,CHANGELOG}.md` | record v3 | Q3 |
| `src/discovery/geo/*` (new: types, countries, map, filter, index, tests) | new module | new tree |
| `src/discovery/orchestrator/types.ts` | deps + summary fields | orchestrator |
| `src/discovery/orchestrator/orchestrator.ts` | partition call at the dedupe→prerank seam | orchestrator |
| `src/discovery/orchestrator/index.ts` | exports if needed | orchestrator |
| `cli/commands/stage3.ts` | pass geo; print | CLI |
| `cli/commands/setup-scope.ts` | two new sections in the loop | Q3 (CLI shell) |
| `cli/format.ts` | summary rendering | CLI |
| scope/orchestrator/cli test files | new + extended tests | tests |

**ZERO LINES:** `src/discovery/prerank/` (verified at Step 3 by
`git diff --stat`), all 12 engines, `src/pipeline/`, `src/persistence/`,
Stage-3 frame/sources/adapters/registry, `orchestrator/sources.ts`,
`ACTIVATED_SOURCES` (Himalayas activation is Q5's SEPARATE, LATER change).

## 8. Test plan (target ≈ +70; suite 1030/78 → ~1100/83-84)

- `scope/tests/geo-schema.test.ts` (~22): v3 parse round-trip; every
  rejection path (bad ISO shape, dup countries, bad unresolved value,
  role_types unknown id / dup id / non-member term / excluded-empty-terms);
  v2 → exact rejection message; baseline v1/v2/v3 tolerance; geo:null valid.
- `scope/tests/geo-reducer.test.ts` (~20): every command incl. notices;
  confirm-refusal on untouched-empty geo; `geo off` ⇒ done allowed ⇒
  buildPreferences stamps null; role_types toggle/adopt; unforgeability
  (buildPreferences throws unconfirmed — extended to new sections);
  baseline ticks-win carry-forward; config-gains-id surfaces as available
  without invalidating (the §4 property, pinned).
- `src/discovery/geo/tests/countries.test.ts` (~12): aliases, cities,
  regions; Hostaway property (148-list w/o IN ⇒ ineligible); padding
  invariance (no length heuristic).
- `src/discovery/geo/tests/map.test.ts` (~15): per-source real-string
  fixtures (all four Greenhouse conventions, multi-value, bare city,
  `"(Remote)"` ⇒ unresolved; himalayas empty ⇒ worldwide-eligible iff
  worldwide_ok; freehire empty ⇒ unresolved; remotive Worldwide; adzuna
  constant; unknown_source). Partition-sum invariant throw.
- `orchestrator/tests/orchestrator.test.ts` (+~10): filter ordering
  (post-dedupe pre-prerank, observable via fakes); per-source counts;
  pass vs gate policy; unknown ALWAYS passes under BOTH policies (Q2 —
  pinned explicitly); geo null ⇒ byte-identical summary to a no-geo run.
- `cli/tests/format.test.ts` (+~5): geo lines, loud unknown-source naming.

## 9. Bounded live verification (Step 2, before the Step-2 pause)

Zero Gemini, zero writes, ≤ 18 requests:

1. **Replay A/B (0 requests):** `research/phase1-eligibility/raw/` captures
   through the REAL new path (orchestrator with fake deps serving disk
   bytes): expect control 324→25 reproduced; geo-filtered ≈ 8 eligible +
   3 unresolved (pass) → ~4 passed; all 45 dup groups dissolved; partition
   sums exact. Divergence from Track-2 numbers ⇒ STOP, report (drift
   discipline) — the research replay and the shipped path must agree.
2. **Live Greenhouse dry-run (8 requests — 4 boards ×2 per #16):**
   `oaos discover --stage3 --source greenhouse --dry-run` with the
   operator's REAL v3 preferences (requires the operator to have run
   `setup-scope` first — the build session cannot create the file; if the
   operator has not re-confirmed by then, this arm blocks and is reported,
   not worked around).
3. **Live Himalayas dry-run (14 requests):** `--source himalayas --dry-run`
   — NOT an activation (Q5 comes later; `--source` is the sanctioned
   bypass). Expect eligible ≈ 11% of fetched; manually inspect the gated
   list for any India/worldwide item (false-positive check = the
   verification's teeth).

## 10. Failure modes & sequencing

As SPEC G1 §7 (alias miss ⇒ visible unresolved; convention drift ⇒
unresolved spike per source; wrong structured field ⇒ filtered unseen —
0/19 measured, spot-audit via `questions=true` as evidence-only). Sequencing:
this wave blocks Himalayas activation (Q5) and the R2 gate; requires
nothing. After merge, the operator must run `oaos setup-scope` once (v3
re-confirmation) before any Stage-3 run works again — **stated plainly: G1
landing bricks Stage 3 until that one interactive re-confirmation. This is
Q2/D15 working as designed, not a defect.**

## Step gates

- **Step 1 = this plan. PAUSE — awaiting operator approval.**
- Step 2: feature branch `feat/geo-eligibility`; implement per §§1-8; full
  suite green; §9 verification; PAUSE with measured results.
- Step 3: docs (CLAUDE.md entry, known-issues cross-refs #23/#25, scope
  CHANGELOG), diff-manifest audit (`git diff --stat` vs §7, prerank/engines
  zero-line check), suite re-run, HOLD AT COMMIT (no merge, no push without
  instruction; any push claim verified via `git fetch origin main` +
  matching `git rev-parse main origin/main`).
