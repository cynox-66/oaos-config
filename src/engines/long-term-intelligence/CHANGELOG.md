# Changelog — Long-Term Intelligence Engine (Engine 12)

## [Initial] — 2026-06-24

Implemented Engine 12 per `docs/engine-specs.md` Section 12 + STEP 2, with gaps
resolved by operator direction (current_weight defaults to 1.0; response =
outcome∈{response,interview,offer,income}; `source_weighting_met` = at least one
qualifying source; calibration emits only triggered factors; `source_proposals`
returns []). Scope is Engine 12 only; Engines 1–11 untouched.

### Added
- `ScoredOutcome`, `EvidenceCitation`, `IntelligenceRequest`, and the suggestion
  + `DataGateStatus` types. `IntelligenceUpdate.applied` is the literal `false`
  (compile-time-enforced).
- `computeIntelligence` — pure, gated suggestions: bounded source-weight
  adjustments (±20%), scoring-factor calibration (±1, triggered factors only via
  the correlation-proxy thresholds), and per-evidence keep/expand/retire signals.
  Each suggestion type is emitted only when its minimum-data gate is met.
- `config.ts` — the data gates, weight bounds, and calibration/evidence
  thresholds.
- Reuses `Score`/`Tier` (Engine 2), `SourceReport`/`OutcomeType` (Engine 9), and
  `AttributionRollup` (Engine 10).
- Vitest suite (7 tests): always-false `applied` (type + runtime), data gates,
  ±20% weight bound, ±1 calibration bound + triggered-only, and evidence-signal
  thresholds.
- README + TSDoc.

### Tooling
- No new dependencies. Pure sync logic. No `tsconfig` added.
