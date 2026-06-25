# Changelog — Income Attribution Engine (Engine 10)

## [Initial] — 2026-06-24

Implemented Engine 10 per `docs/engine-specs.md` Section 10 + STEP 2, with gaps
resolved by operator direction (`source_name === first_touch_source` =
originating source; rollup groups by it; `last_touch_channel` is `Channel|null`,
on-or-before the income date; `IncomeKind` imported from Engine 9). Scope is
Engine 10 only; Engines 1–9 and 11–12 untouched.

### Added
- `OutreachLogEntry`, `AttributionRecord`, `AttributionRollup`,
  `AttributionResult` types.
- `computeAttribution` — pure: one record per income event attributed to the
  opportunity's originating source (reuses Engine 9's
  `computeOriginatingSources`), `last_touch_channel` from the latest qualifying
  outreach, and a per-source rollup with negatives-aware averages.
- Vitest suite (7 tests): first/last touch, recurring income, refund, rollup
  average, and the income sum-check.
- README + TSDoc.

### Tooling
- No new dependencies. Pure sync logic. No `tsconfig` added.
