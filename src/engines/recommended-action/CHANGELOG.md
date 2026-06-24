# Changelog — Recommended Action Engine (Engine 4)

## [Initial] — 2026-06-24

Implemented Engine 4 (Recommended Action Engine) per `docs/engine-specs.md`
Section 4, with the spec items confirmed by operator direction (top_score
unused, mechanical coverage-gap reason augmentation, pipeline-thin as rule 0).
Scope is Engine 4 only; Engines 1–3 and 5–12 are untouched.

### Added
- `Action`, `Recommendation`, `ActionRequest`, `ActionOptions`, and `Rule`
  types. Opportunity / Score / Contact / EvidenceMatch are input-only views
  imported from Engines 1/2/3.
- The full Section-4 decision table encoded as an ordered `RULES` array of
  `{ predicate, action, reason }` objects (not nested if-else), evaluated
  top-down, first match wins:
  - rule 0: pipeline-thin top-of-C (`tier C && pipeline_thin && total ≥ 45`)
    → Outreach, before the C → Ignore rule;
  - rules 1–11: the spec table verbatim;
  - rule 12: catch-all → Ignore (totality guarantee).
- `recommend(request, options?)` — pure, synchronous; "reachable" = a contact
  with `reachability ≥ 3`; `requires_human_review` = confidence < 0.6 OR
  tier_uncertain OR coverage_gap present; reason augmented with the coverage
  gap when present. Defensive against malformed input (never throws).
- `config.ts` — reachability threshold, human-review confidence cutoff, and the
  pipeline-thin top-of-C threshold.
- Vitest suite (26 tests): totality across all 48 combinations, determinism,
  table order, the three review triggers, pipeline-thin thresholds, catch-all
  robustness, and hand-verified spec-table cases.
- Engine README (with the decision table reproduced) and TSDoc.

### Tooling
- No new dependencies. No LLM, no network, no async. No `tsconfig` added (repo
  runs `.ts` via `tsx`).
