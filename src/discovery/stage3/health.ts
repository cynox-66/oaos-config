// health.ts
// File: src/discovery/stage3/health.ts
// Purpose: Pure state machine driving Engine 11's has_health_check semantics.
//          Shared by all three source families — the orchestrator (Wave 6)
//          calls advanceHealth() after every healthCheck() result.

import { MAX_CONSECUTIVE_FAILURES } from "./config";
import type { HealthCheckResult, SourceHealthState } from "./types";

export function createHealthState(source: string): SourceHealthState {
  return {
    source,
    consecutiveFailures: 0,
    status: "healthy",
    lastResult: null,
    recoveredFromDisabled: false,
  };
}

/**
 * One failed check -> probation. Two CONSECUTIVE failures -> auto_disabled.
 * Any success -> healthy, consecutiveFailures reset to 0 - including from
 * auto_disabled, which additionally sets recoveredFromDisabled so the
 * orchestrator can require a manual re-enable. The flag is cleared on the
 * very next advance, success or failure.
 */
export function advanceHealth(state: SourceHealthState, result: HealthCheckResult): SourceHealthState {
  if (result.ok) {
    return {
      source: state.source,
      consecutiveFailures: 0,
      status: "healthy",
      lastResult: result,
      recoveredFromDisabled: state.status === "auto_disabled",
    };
  }

  const consecutiveFailures = Math.min(state.consecutiveFailures + 1, MAX_CONSECUTIVE_FAILURES);
  const status = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? "auto_disabled" : "probation";

  return {
    source: state.source,
    consecutiveFailures,
    status,
    lastResult: result,
    recoveredFromDisabled: false,
  };
}
