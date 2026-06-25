# Source Performance Engine (Engine 9)

Quantifies which sources produce responses → interviews → offers → income, so
effort concentrates. **Pure, synchronous, deterministic** — no LLM, no network.

## `OutcomeEvent[]` (input) → `SourceReport[]` (output)

```ts
OutcomeEvent {
  type: "discovered"|"qualified"|"sent"|"response"|"interview"|"offer"|"income"
  opportunity_id: string
  source_name: string
  date: Date
  amount_inr?: number      // on income events
  kind?: IncomeKind         // on income events (consumed by Engine 10)
}

SourceReport {
  source_name
  discovered, qualified, sent, responses, interviews, offers, income_total
  rates: { qualify, response, interview, offer }   // null when denominator is 0
  sample_size                                       // = sent
  low_confidence                                    // sent < 10
}
```

## Behaviour

- **Originating-source attribution**: every event for an opportunity is
  attributed to that opportunity's **originating source** — the `source_name` on
  its `discovered` event, or (if none) its first chronological event. An event's
  own `source_name` is overridden by this. This prevents double-credit for
  multi-source opportunities.
- **Rates** are `null` (not 0) when their denominator is 0:
  `qualify=qualified/discovered`, `response=responses/sent`,
  `interview=interviews/responses`, `offer=offers/interviews`.
- **`low_confidence = sent < 10`** — a source is never declared "bad" while
  low_confidence.
- **Ranking**: confident sources first by (`income_total` desc, `response_rate`
  desc); low_confidence sources trail, ordered by (`income_total` desc,
  `source_name` asc).
- **Sum-check**: `Σ income_total` across sources equals `Σ amount_inr` over all
  income events.

`computeOriginatingSources` is exported so Engine 10 reuses the identical rule.

## Usage

```ts
import { computeSourcePerformance } from "./index";
const reports = computeSourcePerformance(events);
```

## Running tests

```bash
npm test
```

Covers funnel aggregation, null rates, low_confidence, originating-source
attribution (discovered + first-event fallback), ranking, and the income
sum-check.
