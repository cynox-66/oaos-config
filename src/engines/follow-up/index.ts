// index.ts
// File: src/engines/follow-up/index.ts
// Purpose: Public surface of the Follow-Up Engine (Engine 8).

export { buildFollowUp } from "./followup";
export { computeNextStep } from "./state-machine";
export {
  buildFollowUpPrompt,
  buildRegenPrompt,
  parseFollowUpResponse,
  checkFollowUpConstraints,
} from "./prompts";

export type {
  OutreachStatus,
  TerminalReason,
  FollowUpRequest,
  FollowUpOptions,
  FollowUpState,
} from "./types";
