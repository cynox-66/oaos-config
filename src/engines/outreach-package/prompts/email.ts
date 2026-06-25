// prompts/email.ts
// File: src/engines/outreach-package/prompts/email.ts
// Purpose: Pure email prompt builder (body ≤110 words, subject ≤10 words).

import type { OutreachRequest, ProofPoint } from "../types";
import { contextBlock, evidenceBlock, rulesBlock } from "./shared";

/** Build the email outreach prompt. Pure and deterministic. */
export function buildEmailPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return [
    "Write a cold outreach EMAIL.",
    "Constraints: body ≤110 words. Subject ≤10 words, technical and non-generic.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    evidenceBlock(proof),
    "",
    rulesBlock(),
    "",
    'Return ONLY this JSON: { "subject": "<≤10 words>", "body": "<≤110 words>" }',
  ].join("\n");
}
