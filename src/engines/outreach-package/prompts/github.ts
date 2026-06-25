// prompts/github.ts
// File: src/engines/outreach-package/prompts/github.ts
// Purpose: Pure GitHub prompt builder. The model must judge whether a genuine
//          technical interaction exists; if not it returns
//          has_genuine_opportunity=false and no forced comment.

import type { OutreachRequest, ProofPoint } from "../types";
import { contextBlock, evidenceBlock, rulesBlock } from "./shared";

/** Build the GitHub interaction prompt (technical comment ≤150 words). */
export function buildGithubPrompt(request: OutreachRequest, proof: ProofPoint | null): string {
  return [
    "Propose a GENUINE technical GitHub interaction (e.g. a substantive comment on an issue/PR).",
    "Only write a comment if there is a real, specific technical opportunity. If there is not, do not force one.",
    "If you do write one: body ≤150 words, technical and specific. No subject line.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    evidenceBlock(proof),
    "",
    rulesBlock(),
    "",
    'Return ONLY this JSON: { "has_genuine_opportunity": <true|false>, "body": "<≤150 words, or empty if false>" }',
  ].join("\n");
}
