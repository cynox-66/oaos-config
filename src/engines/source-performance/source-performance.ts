// source-performance.ts
// File: src/engines/source-performance/source-performance.ts
// Purpose: The pure Source Performance Engine (Engine 9). Aggregates outcome
//          events into per-source funnel reports. Every event is attributed to
//          its opportunity's ORIGINATING source (no double credit). Deterministic.

import type { OutcomeEvent, SourceRates, SourceReport } from "./types";
import { LOW_CONFIDENCE_SENT_THRESHOLD } from "./config";

/**
 * Map each opportunity_id to its originating source: the `source_name` on its
 * `discovered` event, or — if there is none — the source on its first
 * chronological event (ties broken by input order). Exported so Engine 10 can
 * reuse the identical attribution rule.
 */
export function computeOriginatingSources(events: OutcomeEvent[]): Map<string, string> {
  const byOpp = new Map<string, { ev: OutcomeEvent; idx: number }[]>();
  events.forEach((ev, idx) => {
    const list = byOpp.get(ev.opportunity_id) ?? [];
    list.push({ ev, idx });
    byOpp.set(ev.opportunity_id, list);
  });

  const origin = new Map<string, string>();
  for (const [oppId, list] of byOpp) {
    const discovered = list.find((x) => x.ev.type === "discovered");
    if (discovered) {
      origin.set(oppId, discovered.ev.source_name);
      continue;
    }
    const first = [...list].sort(
      (a, b) => a.ev.date.getTime() - b.ev.date.getTime() || a.idx - b.idx
    )[0];
    origin.set(oppId, first.ev.source_name);
  }
  return origin;
}

interface Accumulator {
  discovered: number;
  qualified: number;
  sent: number;
  responses: number;
  interviews: number;
  offers: number;
  income_total: number;
}

function emptyAccumulator(): Accumulator {
  return {
    discovered: 0,
    qualified: 0,
    sent: 0,
    responses: 0,
    interviews: 0,
    offers: 0,
    income_total: 0,
  };
}

/** Ratio, or null when the denominator is 0. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Aggregate outcome events into per-source reports. Each event is attributed to
 * its opportunity's originating source (see {@link computeOriginatingSources}).
 * Funnel counts are computed, then ratio metrics (null when a denominator is 0),
 * then `low_confidence` (sent < 10). Sources are ranked: confident sources first
 * by (income_total desc, response_rate desc), then low_confidence sources by
 * (income_total desc, source_name asc).
 *
 * @param events the raw outcome event log.
 */
export function computeSourcePerformance(events: OutcomeEvent[]): SourceReport[] {
  const origin = computeOriginatingSources(events);
  const accumulators = new Map<string, Accumulator>();

  for (const ev of events) {
    const source = origin.get(ev.opportunity_id) ?? ev.source_name;
    const acc = accumulators.get(source) ?? emptyAccumulator();
    switch (ev.type) {
      case "discovered":
        acc.discovered++;
        break;
      case "qualified":
        acc.qualified++;
        break;
      case "sent":
        acc.sent++;
        break;
      case "response":
        acc.responses++;
        break;
      case "interview":
        acc.interviews++;
        break;
      case "offer":
        acc.offers++;
        break;
      case "income":
        acc.income_total += ev.amount_inr ?? 0;
        break;
    }
    accumulators.set(source, acc);
  }

  const reports: SourceReport[] = [...accumulators.entries()].map(([source_name, a]) => {
    const rates: SourceRates = {
      qualify: ratio(a.qualified, a.discovered),
      response: ratio(a.responses, a.sent),
      interview: ratio(a.interviews, a.responses),
      offer: ratio(a.offers, a.interviews),
    };
    return {
      source_name,
      discovered: a.discovered,
      qualified: a.qualified,
      sent: a.sent,
      responses: a.responses,
      interviews: a.interviews,
      offers: a.offers,
      income_total: a.income_total,
      rates,
      sample_size: a.sent,
      low_confidence: a.sent < LOW_CONFIDENCE_SENT_THRESHOLD,
    };
  });

  reports.sort((x, y) => {
    // Confident sources rank ahead of low_confidence ones.
    if (x.low_confidence !== y.low_confidence) return x.low_confidence ? 1 : -1;
    // Primary: income_total desc.
    if (y.income_total !== x.income_total) return y.income_total - x.income_total;
    if (!x.low_confidence) {
      // Confident secondary: response_rate desc.
      const xr = x.rates.response ?? 0;
      const yr = y.rates.response ?? 0;
      if (yr !== xr) return yr - xr;
    }
    // Final deterministic tie-break: source_name asc.
    return x.source_name < y.source_name ? -1 : x.source_name > y.source_name ? 1 : 0;
  });

  return reports;
}
