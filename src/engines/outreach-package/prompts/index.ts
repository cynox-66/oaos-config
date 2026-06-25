// prompts/index.ts
// File: src/engines/outreach-package/prompts/index.ts
// Purpose: Channel → prompt-builder selection. To add a channel: add its builder
//          and wire it here (and add its limits to config.ts).

import type { Channel, OutreachRequest, ProofPoint } from "../types";
import { buildEmailPrompt } from "./email";
import { buildLinkedinConnectPrompt, buildLinkedinDmPrompt } from "./linkedin";
import { buildGithubPrompt } from "./github";
import { buildSlackPrompt } from "./slack";
import { withRegenInstructions } from "./shared";

/** A pure channel prompt builder. */
export type PromptBuilder = (request: OutreachRequest, proof: ProofPoint | null) => string;

const BUILDERS: Record<Channel, PromptBuilder> = {
  email: buildEmailPrompt,
  linkedin_connect: buildLinkedinConnectPrompt,
  linkedin_dm: buildLinkedinDmPrompt,
  github: buildGithubPrompt,
  slack: buildSlackPrompt,
};

/** Select the prompt builder for a channel. */
export function selectPromptBuilder(channel: Channel): PromptBuilder {
  return BUILDERS[channel];
}

/** Build the initial prompt for a channel. */
export function buildPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return selectPromptBuilder(request.channel)(request, proof);
}

/** Build the single regeneration prompt with violations quoted as forbidden. */
export function buildRegenPrompt(
  request: OutreachRequest,
  proof: ProofPoint | null,
  violations: string[]
): string {
  return withRegenInstructions(buildPrompt(request, proof), violations);
}

export {
  buildEmailPrompt,
  buildLinkedinConnectPrompt,
  buildLinkedinDmPrompt,
  buildGithubPrompt,
  buildSlackPrompt,
};
export { parseDraftResponse } from "./shared";
