# Income Attribution Engine (Engine 10)

Ties money back to source → opportunity → outcome — the root objective, measured.
**Pure, synchronous, deterministic** — no LLM, no network.

## `computeAttribution(events, outreachLog)` → `{ records, rollup }`

```ts
OutreachLogEntry { opportunity_id, channel: Channel, date: Date }

AttributionRecord {
  opportunity_id, source_name, kind: IncomeKind, amount_inr,
  first_touch_source,                  // == source_name (originating source)
  last_touch_channel: Channel | null,  // latest outreach on/before income date
  recognized_date: Date
}

AttributionRollup { source_name, total_inr, count, avg_inr }
```

## Behaviour

- **First-touch attribution**: `source_name` and `first_touch_source` both carry
  the opportunity's **originating source** (its `discovered` event, else first
  chronological event — identical to Engine 9). The income event's own raw
  `source_name` is ignored.
- **`last_touch_channel`**: the channel of the latest outreach log entry dated
  **on or before** `recognized_date`, or `null` when there is none.
- **Recurring income** → one record per income event (same opportunity_id); the
  rollup sums them.
- **Refund/clawback**: a negative `amount_inr` produces a negative record;
  `avg_inr = total_inr / count` includes negatives.
- **Equity/deferred** is not represented and is never counted as income.
- **Sum-check**: `Σ record amounts` equals `Σ income event amounts`; rollups
  reconcile.

## Usage

```ts
import { computeAttribution } from "./index";
const { records, rollup } = computeAttribution(events, outreachLog);
```

## Running tests

```bash
npm test
```

Covers first/last touch, recurring income, refunds, rollup averages (with
negatives), and the income sum-check.
