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
