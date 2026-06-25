// index.ts
// File: src/engines/outreach-package/index.ts
// Purpose: Public surface of the Outreach Package Engine (Engine 7).

export { buildOutreachDraft } from "./draft";
export { checkConstraints, wordCount, normalizeText } from "./constraints";
export {
  buildPrompt,
  buildRegenPrompt,
  selectPromptBuilder,
  parseDraftResponse,
  buildEmailPrompt,
  buildLinkedinConnectPrompt,
  buildLinkedinDmPrompt,
  buildGithubPrompt,
  buildSlackPrompt,
} from "./prompts";

export type {
  Channel,
  AskType,
  OutreachRequest,
  OutreachOptions,
  OutreachDraft,
  ConstraintResult,
  ProofPoint,
} from "./types";
