// types.ts
// File: src/engines/source-performance/types.ts
// Purpose: Type definitions for the Source Performance Engine (Engine 9).
//          Mirrors docs/engine-specs.md Section 9 + STEP 2. `OutcomeEvent` /
//          `OutcomeType` / `IncomeKind` are shared with Engine 10.

// ============================================================
// Events
// ============================================================

/** Funnel event types (frozen by spec). */
export type OutcomeType =
  | "discovered"
  | "qualified"
  | "sent"
  | "response"
  | "interview"
  | "offer"
  | "income";

/** Kind of income (carried on `income` events; consumed by Engine 10). */
export type IncomeKind = "freelance" | "salary" | "bounty" | "stipend";

/** A single outcome event. */
export interface OutcomeEvent {
  type: OutcomeType;
  opportunity_id: string;
  source_name: string;
  date: Date;
  /** Present on `income` events (INR). */
  amount_inr?: number;
  /** Present on `income` events (consumed by Engine 10). */
  kind?: IncomeKind;
}

// ============================================================
// Output
// ============================================================

/** Funnel conversion rates; each is null when its denominator is 0. */
export interface SourceRates {
  /** qualified / discovered */
  qualify: number | null;
  /** responses / sent */
  response: number | null;
  /** interviews / responses */
  interview: number | null;
  /** offers / interviews */
  offer: number | null;
}

/** Per-source funnel + rates report. */
export interface SourceReport {
  source_name: string;
  discovered: number;
  qualified: number;
  sent: number;
  responses: number;
  interviews: number;
  offers: number;
  income_total: number;
  rates: SourceRates;
  /** The response-rate denominator (`sent`). */
  sample_size: number;
  /** True when `sent` < 10 (rates unstable). */
  low_confidence: boolean;
}
