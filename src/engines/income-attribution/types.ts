// types.ts
// File: src/engines/income-attribution/types.ts
// Purpose: Type definitions for the Income Attribution Engine (Engine 10).
//          Mirrors docs/engine-specs.md Section 10 + STEP 2. Reuses
//          OutcomeEvent / IncomeKind from Engine 9 and Channel from Engine 7.

import type { IncomeKind, OutcomeEvent } from "../source-performance/types";
import type { Channel } from "../outreach-package/types";

export type { IncomeKind, OutcomeEvent, Channel };

// ============================================================
// Inputs
// ============================================================

/** One outreach touch on an opportunity (for last-touch-channel resolution). */
export interface OutreachLogEntry {
  opportunity_id: string;
  channel: Channel;
  date: Date;
}

// ============================================================
// Outputs
// ============================================================

/**
 * One income attribution record. `source_name` and `first_touch_source` carry
 * the same value — the opportunity's originating (first-touch) source.
 */
export interface AttributionRecord {
  opportunity_id: string;
  source_name: string;
  kind: IncomeKind;
  amount_inr: number;
  first_touch_source: string;
  /** Channel of the latest outreach on or before recognized_date, or null. */
  last_touch_channel: Channel | null;
  recognized_date: Date;
}

/** Per-source income rollup. */
export interface AttributionRollup {
  source_name: string;
  total_inr: number;
  count: number;
  avg_inr: number;
}

/** Result of {@link computeAttribution}. */
export interface AttributionResult {
  records: AttributionRecord[];
  rollup: AttributionRollup[];
}
