// prompts/linkedin.ts
// File: src/engines/outreach-package/prompts/linkedin.ts
// Purpose: Pure LinkedIn prompt builders — connect note (≤300 chars) and DM
//          (≤80 words). Neither carries a subject.

import type { OutreachRequest, ProofPoint } from "../types";
import { contextBlock, evidenceBlock, rulesBlock } from "./shared";

/** Build the LinkedIn connection-note prompt (≤300 chars). */
export function buildLinkedinConnectPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return [
    "Write a LinkedIn CONNECTION NOTE.",
    "Constraint: the entire message ≤300 characters. No subject line.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    evidenceBlock(proof),
    "",
    rulesBlock(),
    "",
    'Return ONLY this JSON: { "body": "<≤300 characters>" }',
  ].join("\n");
}

/** Build the LinkedIn direct-message prompt (≤80 words). */
export function buildLinkedinDmPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return [
    "Write a LinkedIn DIRECT MESSAGE.",
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
