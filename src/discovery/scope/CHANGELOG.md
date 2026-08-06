# Changelog — Discovery Scope

## [0.1.0] — 2026-07-20

Initial implementation. Wave 1 of OAOS Phase 1, implementing decision D15.

### Added

- `deriveScope(inputs, deps)` — pure derivation of a proposed discovery field
  map from `base_resume.json`, `operator_profile.json`, and
  `evidence/inventory.md`. Zero I/O, zero LLM, zero network; deterministic under
  an injected `now`.
- Exact normalized matching (`normalizeTerm`, `computeBacking`) — lowercase,
  trim, collapse `[-_\s]+`, preserve `/`. No fuzzy matching, by decision:
  under-proposing costs a keystroke, silent scope widening violates D15.
- `preferences.json` schema + strict validator/loader/writer. Validation on read
  **and** write, never coercing; errors name the exact offending path.
- The two locked literals — `remote_only: true` and `work_types.freelance:
  false` — enforced at three layers: literal types, reducer refusal, validator
  rejection.
- Pure reducer (`reduceScope`, `parseScopeCommand`, `initialState`,
  `buildPreferences`) for the interactive loop, so the whole decision surface is
  testable without a TTY.
- `buildPreferences` throws unless the state is confirmed — `confirmed_at` can
  only be stamped by explicit operator confirmation.
- Re-run support: an existing `preferences.json` becomes the tick baseline;
  operator ticks always win over a fresh proposal; evidence backing is
  recomputed; newly-backed fields are reported for display.
- CLI `oaos setup-scope [--show]` — interactive confirm-and-save, or read-only
  print. Reuses the existing `createPrompter` from `cli/prompts.ts`.
- 77 tests across generator, preferences, reducer, and CLI rendering.

### The unforgeability pattern

Confirmation is structural, not conventional. An unconfirmed scope is not
representable as `Preferences`: `deriveScope` returns a `ScopeProposal`, and
`buildPreferences` — the sole stamper of `confirmed_at` — throws unless
`status === "confirmed"`. The confirmed interactive path is therefore the only
legitimate producer of `preferences.json`. Future consumers (Wave 5 query
builders, Wave 6 orchestration) read it; nothing else writes it.

### Decisions recorded

- Engine 1's vocabulary is imported from `src/engines/normalization/config.ts`
  (`DOMAIN_KEYWORDS`) rather than re-exported from that engine's `index.ts`, so
  no frozen engine file is modified. `"Other"` is excluded by construction.
- The profile scan covers `resume.skills[]`, `resume.projects[].tech_tags[]`,
  and `profile.stack[]`.
- `preferences.json` lives at the repo root and is gitignored — it is
  operator-specific state, same posture as the `discovery-inbox/` contents.
- `evidence_backed` must agree with `supporting_evidence_ids.length > 0`. Both
  are stored for downstream readability, so the validator enforces consistency
  rather than trusting a hand edit.

### Not wired

`preferences.json` has no consumer yet. Wave 5/6 feeds it to the per-source
query builders and to the prerank gate's `vocabulary` input.

---

## Seniority dimension — schema v2 (2026-08-06)

Adds the operator's first way to express **entry-level intent**. Before this,
`orchestrator/vocabulary.ts` took `domainTerms` from `preferences.json` but
`roleTerms` *and* `negativeTerms` from `DEFAULT_VOCABULARY`, so there was no
seniority axis anywhere in confirmed scope. The negative-term half of that
asymmetry is now closed. The `roleTerms` half remains open, by design and
recorded in that file's header.

### Shape

`Preferences.seniority = { levels: [{ level, excluded, terms }],
entry_level_query_modifier }`.

- **Five levels, closed set** — `senior` / `staff` / `principal` / `lead` /
  `management`. Unlike `fields`, there is deliberately **no `add` path**: an
  operator-authored exclusion term would be an unreviewed entry in an
  unconditional, pre-scoring gate.
- **`entry_level_query_modifier` is a separate boolean**, not derived from
  `levels`. Excluding a level filters what came back; the modifier rewrites what
  third-party APIs are asked for and can collapse a result set. Different
  consequences, so two confirmations.
- A years-of-experience level was **considered and not built** — real phrasing
  varies too widely to enumerate ("minimum of 10 years", "10-12 years", "a
  decade of"), so any list would under-cover while still over-gating.

### The expanded terms are persisted (operator ruling, overruling precedent)

`ScopeField` persists a label (`"Kubernetes"`) and lets config expand it. That
is right for a **positive** signal — worst case it matches more of what the
operator wanted. Seniority expands a **negative, unconditional, pre-scoring**
gate, whose worst case is silently deleting opportunities the operator never
sees. A term-list edit is therefore a scope change, and D15 requires scope
changes to be re-confirmed — which is only possible if the file records what was
actually confirmed.

Consequences, both intentional:

- Config may **gain** terms freely. They surface as `available` /
  `<NEW TERMS>` and enter the file only via an explicit `adopt s<n>`.
- Config **removing** a term invalidates every file that persisted it, loudly.
  A session that removes one owes the operator a migration.

The validator checks **membership in the union of all levels' term lists**, not
per-level equality, so a term that migrates between levels does not break
existing files.

### Migration: the split that makes the version bump survivable

`PREFERENCES_VERSION` 1 → 2. A v1 file is **rejected with an actionable
message**, never upgraded, defaulted, or coerced.

The non-obvious part: `setup-scope` reads the existing file to carry the
operator's ticks forward, so a strictly-rejecting read would make the one
command that fixes a v1 file the one command that cannot open it — and the
message's promise to preserve their ticks would be false. Hence:

| reader | version | returns | used by |
|---|---|---|---|
| `parsePreferences` / `loadPreferences` | strictly 2 | `Preferences` | every discovery path |
| `parseBaseline` / `loadBaseline` | 1 or 2 | `ScopeBaseline` | `setup-scope` only |

`ScopeBaseline` is deliberately **not** a `Preferences`: a tolerated v1 file
still cannot become a persisted scope without passing through the reducer and a
confirmed `buildPreferences`. Everything other than the version literal is
validated by the same strict code. Unforgeability is unchanged.

### Proposed unticked, always

Nothing excluded, modifier off — on a fresh derivation and on a v1 migration
alike. Under-proposing is standing policy, but the reason is sharper here: a
negative term is unconditional and pre-scoring, so a wrong pre-tick deletes
opportunities invisibly while a missed tick costs one keystroke. It also makes
the migration **behaviour-neutral** — re-confirming without touching the section
reproduces the previous discovery exactly.

### Interactive surface

`s<n>` toggles a level, `adopt s<n>` takes its newly available terms, `entry`
toggles the modifier. Seniority has its own `s`-prefixed namespace so plain
field numbers keep meaning exactly what they meant before; nothing renumbers.
Each level renders its exact terms next to it, with the whole-text warning
inline — the operator is confirming a blunt instrument and is told so at the
moment of confirmation.

### The caveat that governs the term lists

`negativeTerms` are matched against an item's **whole text**, body included, not
its title, and the gate runs **before** scoring. See `seniority.ts`'s header and
`docs/known-issues.md` #23. Measured live 2026-08-06: harmless at
`maxPerRun: 25` (17 of 171 gated items were in the control's visible 25, all of
them genuine senior titles), and **that result is scoped to k = 25**. Bare level
words were rejected wherever they carry a non-seniority meaning — notably bare
`sr`, which matches `sr-iov` because `-` is a boundary character.

## [0.3.0] — 2026-08-06 — geo eligibility + role_types schema (v3, wave G1)

Schema `2 → 3`. Operator rulings Q1–Q4 (research/phase1-eligibility, FINDINGS
§4) govern everything below.

### Added

- `Preferences.geo: GeoPreference | null` — `eligible_countries` (ISO-3166
  alpha-2, uppercase, non-empty while active), `worldwide_ok`, `unresolved:
  "pass" | "gate"`. `null` = confirmed `geo off` (filter disabled; v2-identical
  discovery). Eligibility downstream is decided by MEMBERSHIP TESTS ONLY,
  never list-length heuristics (the Hostaway 148-country-EMEA finding).
- `Preferences.role_types` — exclusion intent with persisted title-scoped
  terms (`role-types.ts`, closed id set). SCHEMA ONLY: the gate is
  deliberately not built (ruling Q4), so a later gate build needs no version
  bump. `roleTypeExclusionTerms` exported as the future gate's seam; nothing
  calls it in v3.
- Reducer commands: `geo add|remove <cc>`, `geo worldwide on|off`,
  `geo unresolved pass|gate`, `geo off|on`, `rt<n>`, `adopt rt<n>`.
  `confirm` refuses on an active-but-empty geo section, naming both exits.
- Validator: strict on both new sections; role_types completeness NOT
  required (the ruled Q4 asymmetry — see README; config may gain ids freely,
  a config-gained id surfaces as `<NEW>` and never invalidates a file).
- Migration: v2 rejected on consumption with the exact ruled message;
  `parseBaseline` reads v1/v2/v3, `geo`/`role_types` tri-state
  (`undefined` pre-v3 / `null` confirmed-off / object confirmed).
- `unknown_source` ruling (Q2) recorded on `GeoPreference.unresolved`'s doc:
  the policy governs mapper-ran-but-unparseable ONLY; a source with no mapper
  always passes the orchestrator filter and is reported loudly by name.

### Unchanged

`buildPreferences` remains the sole stamper (unforgeability extends to both
sections with zero new mechanism); the two locked literals; all v2 seniority
semantics including its completeness invariant.

### Verification

+90 tests (suite 1030 → 1120, 78 → 83 files). Live-verified 2026-08-06: the
operator re-confirmed v3 via a real `oaos setup-scope`; a Greenhouse dry-run
through the geo filter matched the captured-bytes replay byte-for-byte
(446 → 324 → 8 eligible + 1 unresolved → 4 passed); a Himalayas `--source`
dry-run measured 18/200 eligible with a clean false-positive audit.
