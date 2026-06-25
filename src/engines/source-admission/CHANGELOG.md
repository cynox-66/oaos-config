# Changelog — Discovery Source Admission Engine (Engine 11)

## [Initial] — 2026-06-24

Implemented Engine 11 per `docs/engine-specs.md` Section 11 + STEP 2, with the
gap resolved by operator direction (scrape routes to probation and never emits
its own failed-check string). Scope is Engine 11 only; Engines 1–10 and 12
untouched.

### Added
- `IngestionType`, `SourceProposal`, `AdmittedSource`, `AdmissionDecision` types.
- `admitSource` — pure: evaluates the six content checks + the global
  maintenance-budget check, routes a passing `scrape` to probation, and computes
  `global_budget_remaining_min` for both admitted and rejected cases.
- `config.ts` — `GLOBAL_MAINT_BUDGET_MIN_PER_WEEK = 50` and the per-source
  maintenance ceiling.
- Vitest suite (10 tests): all-pass, scrape→probation (+ scrape-fails-other),
  cost/justification, health_check, maint ceiling, global budget breach, and
  remaining-budget math.
- README + TSDoc.

### Tooling
- No new dependencies. Pure sync logic. No `tsconfig` added.
