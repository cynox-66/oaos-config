// income-attribution.ts
// File: src/engines/income-attribution/income-attribution.ts
// Purpose: The pure Income Attribution Engine (Engine 10). Ties each income
//          event to its opportunity's originating (first-touch) source and the
//          last outreach channel, and rolls income up per source. Deterministic.

import { computeOriginatingSources } from "../source-performance/source-performance";
import type { OutcomeEvent } from "../source-performance/types";
import type {
  AttributionRecord,
  AttributionResult,
  AttributionRollup,
  Channel,
  OutreachLogEntry,
} from "./types";

/** Default income kind when an income event omits one (income events should set it). */
const DEFAULT_KIND = "freelance" as const;

/**
 * The channel of the latest outreach on opportunity `oppId` dated on or before
 * `recognizedDate`, or null when there is none. Ties broken by input order
 * (latest entry wins).
 */
function lastTouchChannel(
  oppId: string,
  recognizedDate: Date,
  log: OutreachLogEntry[]
): Channel | null {
  const candidates = log
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      (x) => x.entry.opportunity_id === oppId && x.entry.date.getTime() <= recognizedDate.getTime()
    );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.entry.date.getTime() - a.entry.date.getTime() || b.idx - a.idx);
  return candidates[0].entry.channel;
}

/**
 * Attribute income events to sources and roll income up per source. Pure and
 * deterministic.
 *
 * - `first_touch_source` / `source_name`: the opportunity's originating source
 *   (its `discovered` event, else its first chronological event — identical to
 *   Engine 9's rule), NOT the income event's own raw source.
 * - `last_touch_channel`: the latest outreach channel on or before the income
 *   date, or null.
 * - Recurring income → one record per income event. Refund/clawback → a negative
 *   record. (Equity/deferred is not represented and is never counted here.)
 *
 * @param events the outcome event log (only `income` events produce records).
 * @param outreachLog outreach touches, for last-touch-channel resolution.
 */
export function computeAttribution(
  events: OutcomeEvent[],
  outreachLog: OutreachLogEntry[]
): AttributionResult {
  const origin = computeOriginatingSources(events);

  const records: AttributionRecord[] = events
    .filter((e) => e.type === "income")
    .map((e) => {
      const source = origin.get(e.opportunity_id) ?? e.source_name;
      return {
        opportunity_id: e.opportunity_id,
        source_name: source,
        kind: e.kind ?? DEFAULT_KIND,
        amount_inr: e.amount_inr ?? 0,
        first_touch_source: source,
        last_touch_channel: lastTouchChannel(e.opportunity_id, e.date, outreachLog),
        recognized_date: e.date,
      };
    });

  // Roll up per source (first-appearance order).
  const order: string[] = [];
  const totals = new Map<string, { total_inr: number; count: number }>();
  for (const r of records) {
    if (!totals.has(r.source_name)) {
      totals.set(r.source_name, { total_inr: 0, count: 0 });
      order.push(r.source_name);
    }
    const t = totals.get(r.source_name)!;
    t.total_inr += r.amount_inr;
    t.count += 1;
  }

  const rollup: AttributionRollup[] = order.map((source_name) => {
    const t = totals.get(source_name)!;
    return {
      source_name,
      total_inr: t.total_inr,
      count: t.count,
      avg_inr: t.count === 0 ? 0 : t.total_inr / t.count,
    };
  });

  return { records, rollup };
}
