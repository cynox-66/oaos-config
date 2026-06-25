// prompts/slack.ts
// File: src/engines/outreach-package/prompts/slack.ts
// Purpose: Pure Slack prompt builder (body ≤80 words, no subject).

import type { OutreachRequest, ProofPoint } from "../types";
import { contextBlock, evidenceBlock, rulesBlock } from "./shared";

/** Build the Slack outreach prompt (≤80 words). */
export function buildSlackPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return [
    "Write a Slack message (e.g. CNCF Slack).",
    "Constraint: body ≤80 words. No subject line.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    evidenceBlock(proof),
    "",
    rulesBlock(),
    "",
    'Return ONLY this JSON: { "body": "<≤80 words>" }',
  ].join("\n");
}
