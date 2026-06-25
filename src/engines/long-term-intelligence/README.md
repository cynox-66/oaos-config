# Long-Term Intelligence Engine (Engine 12)

Uses accumulated outcomes to suggest re-weighting discovery and recalibrating
scoring — the system learning where leverage is. **Read-only**: every output is
a *suggestion*; `applied` is always the literal `false`. **Pure, synchronous,
deterministic** — no LLM, no network.

## `computeIntelligence(request)` → `IntelligenceUpdate`

```ts
IntelligenceRequest {
  scoreHistory: ScoredOutcome[]        // { opportunity_id, score, tier, outcome, source_name }
  sourceReports: SourceReport[]        // from Engine 9
  attributionRollup: AttributionRollup[] // from Engine 10
  evidenceCitations: EvidenceCitation[]  // { evidence_id, opportunity_id, response_received }
}

IntelligenceUpdate {
  source_weight_suggestions, scoring_calibration, evidence_signal,
  source_proposals: string[],          // always [] (future extension)
  applied: false,                       // ALWAYS false — literal type
  data_gates: { source_weighting_met, scoring_calibration_met, evidence_signal_met }
}
```

## Minimum-data gates (suggest nothing below them)

- **source weighting**: a source with ≥20 sent **and** ≥5 responses (per source).
- **scoring calibration**: ≥30 scored+resolved opportunities.
- **evidence signal**: ≥15 cited-evidence outreach.

## Suggestion logic

- **Source weight** (per gate-meeting source): `rate = responses/sent`;
  `deviation = (rate − mean_rate)/mean_rate`; `suggested = clamp(1.0·(1+deviation),
  0.8, 1.2)`. `current_weight` defaults to 1.0; `low_confidence_signal` is copied
  from the source report.
- **Scoring calibration** (per factor: domain/oss/leverage/stage/overlap/evidence/
  contact/network): `proxy = mean(factor | responded) − mean(factor | not)`.
  `|proxy| < 0.05` → `−1` (down-weight); `proxy > 0.15` → `+1` (up-weight);
  otherwise **no entry**. "responded" = outcome ∈ {response, interview, offer,
  income}. `bounded` is always true.
- **Evidence signal** (per evidence_id): `response_correlation = cited-with-
  response / total cited`; `≥0.4 → keep`, `≥0.2 → expand`, `<0.2 → retire`.

## Usage

```ts
import { computeIntelligence } from "./index";
const update = computeIntelligence(request);   // update.applied is always false
```

## Running tests

```bash
npm test
```

Covers the always-false `applied` (type-level + runtime), data gates, ±20%
weight bounds, ±1 calibration bounds with triggered-only emission, and the
evidence-signal thresholds.
