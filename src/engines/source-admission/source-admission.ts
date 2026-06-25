// source-admission.ts
// File: src/engines/source-admission/source-admission.ts
// Purpose: The pure Discovery Source Admission Engine (Engine 11). Evaluates a
//          SourceProposal against the admission checks + the global maintenance
//          budget. A `scrape` source is routed to probation (not failed).
//          Deterministic.

import type { AdmissionDecision, AdmittedSource, SourceProposal } from "./types";
import { GLOBAL_MAINT_BUDGET_MIN_PER_WEEK, MAX_MAINT_MIN_PER_WEEK } from "./config";

/**
 * Decide whether to admit a discovery source. Returns `admit` (all content
 * checks + the global budget pass), `probation` (true only for a scrape source
 * that would otherwise be admitted), the list of failed checks, and the
 * remaining global maintenance budget.
 *
 * Note: `scrape` is NOT a failed check — it routes an otherwise-passing proposal
 * to probation. A scrape that fails another check is rejected with only that
 * other check listed.
 *
 * @param proposal the source proposal.
 * @param admittedSources currently-admitted sources (for the budget sum).
 */
export function admitSource(
  proposal: SourceProposal,
  admittedSources: AdmittedSource[]
): AdmissionDecision {
  const failed: string[] = [];

  // Cost: free, or justified by a documented manual-trial result.
  const justified = typeof proposal.justification === "string" && proposal.justification.trim() !== "";
  if (proposal.cost_per_month_inr !== 0 && !justified) {
    failed.push("cost: cost_per_month_inr > 0 requires a non-empty justification");
  }

  // Per-source maintenance ceiling.
  if (proposal.est_maint_min_per_week > MAX_MAINT_MIN_PER_WEEK) {
    failed.push(`maint: est_maint_min_per_week (${proposal.est_maint_min_per_week}) exceeds ${MAX_MAINT_MIN_PER_WEEK}`);
  }

  // Operational safety checks.
  if (!proposal.has_health_check) failed.push("health_check: has_health_check is false");
  if (!proposal.dedupe_compatible) failed.push("dedupe: dedupe_compatible is false");
  if (!proposal.survives_format_change) failed.push("format_change: survives_format_change is false");

  // Global maintenance budget.
  const existingMaint = admittedSources.reduce((s, a) => s + a.est_maint_min_per_week, 0);
  if (existingMaint + proposal.est_maint_min_per_week > GLOBAL_MAINT_BUDGET_MIN_PER_WEEK) {
    failed.push(
      `budget: total maintenance would exceed the global budget of ${GLOBAL_MAINT_BUDGET_MIN_PER_WEEK} min/week`
    );
  }

  // scrape is allowed only on probation — a routing decision, not a failure.
  const admit = failed.length === 0;
  const probation = admit && proposal.type === "scrape";

  const global_budget_remaining_min =
    GLOBAL_MAINT_BUDGET_MIN_PER_WEEK - existingMaint - (admit ? proposal.est_maint_min_per_week : 0);

  return { admit, probation, failed_checks: failed, global_budget_remaining_min };
}
