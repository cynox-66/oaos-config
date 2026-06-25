# Changelog — Source Performance Engine (Engine 9)

## [Initial] — 2026-06-24

Implemented Engine 9 per `docs/engine-specs.md` Section 9 + STEP 2, with gaps
resolved by operator direction (all events remapped to the opportunity's
originating source; low_confidence-group ordering by income then source_name;
`kind?: IncomeKind` added to `OutcomeEvent` for Engine 10). Scope is Engine 9
only; Engines 1–8 and 10–12 untouched.

### Added
- `OutcomeType` / `IncomeKind` / `OutcomeEvent` (shared with Engine 10),
  `SourceRates`, `SourceReport` types.
- `computeOriginatingSources` (exported, reused by Engine 10) — discovered-event
  source, else first chronological event.
- `computeSourcePerformance` — pure aggregation: remap events to originating
  source, funnel counts, null-guarded rates, `low_confidence` (sent<10), and the
  confident-first / low_confidence-trailing ranking.
- `config.ts` — the low-confidence `sent` threshold.
- Vitest suite (8 tests): funnel counts, null rates, low_confidence,
  originating-source attribution, ranking, income sum-check.
- README + TSDoc.

### Tooling
- No new dependencies. Pure sync logic. No `tsconfig` added.
