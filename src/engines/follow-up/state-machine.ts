// state-machine.ts
// File: src/engines/follow-up/state-machine.ts
// Purpose: The pure (no-LLM) follow-up state machine. Determines the next step,
//          due date, and terminal condition WITHOUT generating a draft.
//          Wall-clock-independent: terminal comes only from status/step, due
//          dates come only from sent_date.

import type { FollowUpRequest, FollowUpState, TerminalReason } from "./types";
import { DUE_DAYS_BY_FU, MAX_FOLLOWUPS, MS_PER_DAY } from "./config";

/** Build a terminal state (no draft, no due date). */
function terminal(request: FollowUpRequest, reason: TerminalReason): FollowUpState {
  return {
    outreach_id: request.outreach_id,
    step: request.step,
    next_due: null,
    draft: null,
    terminal: true,
    terminal_reason: reason,
  };
}

/**
 * Compute the next follow-up state. Pure and deterministic; `now` is accepted
 * for signature/determinism parity but does NOT gate behavior.
 *
 * Terminal precedence: a response/bounce/cancel halts the sequence immediately
 * (a reply between schedule and send is caught here, before any draft is made).
 *
 * @param request the outreach record + last-sent `step`.
 * @param now reference clock (unused by the logic).
 */
export function computeNextStep(request: FollowUpRequest, now: Date): FollowUpState {
  void now; // intentionally unused — state is wall-clock-independent.

  // 1. Terminal statuses halt the sequence (response cancels pending sends).
  if (request.status === "Replied") return terminal(request, "replied");
  if (request.status === "Bounced") return terminal(request, "bounced");
  if (request.status === "Cancelled") return terminal(request, "cancelled");
  if (request.status === "No_Response") return terminal(request, "no_response");

  // 2. OSS suppression: OSS engagement is pre-application on GitHub; once a
  //    follow-up would be a POST-application nudge (step >= 1) it is suppressed
  //    (process-owned). step 0 still gets FU1 (pre-application engagement).
  if (request.opportunity.category === "OSS" && request.step >= 1) {
    return terminal(request, "oss_suppressed");
  }

  // 3. Hard cap: FU3 already sent (step 3) → sequence exhausted, no reply.
  if (request.step >= MAX_FOLLOWUPS) return terminal(request, "no_response");

  // 4. Schedule the next follow-up (FU = step + 1, never > 3 by step 3 above).
  const nextFu = request.step + 1;
  const next_due = new Date(request.sent_date.getTime() + DUE_DAYS_BY_FU[nextFu] * MS_PER_DAY);

  return {
    outreach_id: request.outreach_id,
    step: nextFu,
    next_due,
    draft: null,
    terminal: false,
    terminal_reason: null,
  };
}
