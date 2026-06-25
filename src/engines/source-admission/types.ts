// types.ts
// File: src/engines/source-admission/types.ts
// Purpose: Type definitions for the Discovery Source Admission Engine
//          (Engine 11). Mirrors docs/engine-specs.md Section 11 + STEP 2.

/** How a source ingests items. */
export type IngestionType = "rss" | "api" | "email_alert" | "scrape";

/** A proposed discovery source to admit. */
export interface SourceProposal {
  name: string;
  type: IngestionType;
  auth_required: boolean;
  est_volume_per_week: number;
  est_maint_min_per_week: number;
  cost_per_month_inr: number;
  has_health_check: boolean;
  dedupe_compatible: boolean;
  survives_format_change: boolean;
  /** Documented manual-trial income result; required when cost > 0. */
  justification?: string;
}

/** An already-admitted source (for the global maintenance-budget check). */
export interface AdmittedSource {
  name: string;
  est_maint_min_per_week: number;
  probation: boolean;
}

/** The admission decision. */
export interface AdmissionDecision {
  admit: boolean;
  probation: boolean;
  /** Human-readable names of the checks that failed (empty when admit=true). */
  failed_checks: string[];
  /** Remaining global maintenance budget after this decision. */
  global_budget_remaining_min: number;
}
