// prompts/shared.ts
// File: src/engines/outreach-package/prompts/shared.ts
// Purpose: Shared, pure prompt fragments and the response parser used by every
//          channel prompt builder.

import type { OutreachRequest, ProofPoint } from "../types";
import { ASK_TYPE_INTENT, BANNED_PHRASES, GREETING_OPENERS } from "../config";

/** Contact + opportunity facts the model may use (and only these). */
export function contextBlock(request: OutreachRequest): string {
  const { contact, opportunity, ask_type } = request;
  return [
    `Recipient: ${contact.name} — ${contact.title} at ${contact.company}`,
    contact.oss_overlap ? `Recipient OSS overlap: ${contact.oss_overlap}` : "",
    `Opportunity: ${opportunity.role} at ${opportunity.company}`,
    `Opportunity domains: ${opportunity.domain.join(", ") || "(none)"}`,
    `Opportunity notes: ${opportunity.description_norm || "(none)"}`,
    `Goal: ${ASK_TYPE_INTENT[ask_type]}.`,
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

/** The single evidence asset to cite, or the sparse-evidence instruction. */
export function evidenceBlock(proof: ProofPoint | null): string {
  if (proof === null) {
    return "No specific evidence is available. Reference the sender's relevant capability in general terms. Do NOT invent a project or include any link.";
  }
  return [
    "Cite EXACTLY this one evidence asset (include its URL exactly once, mention no other link or project):",
    `- ${proof.evidence.title}: ${proof.evidence.relevance_blurb}`,
    `  URL: ${proof.evidence.url}`,
    `  Why it fits: ${proof.reason}`,
  ].join("\n");
}

/** Channel-agnostic writing rules (opener, single-evidence, banned phrases). */
export function rulesBlock(): string {
  const greetings = GREETING_OPENERS.map((g) => g[0].toUpperCase() + g.slice(1)).join(", ");
  return [
    "RULES:",
    `- Open with a SPECIFIC technical observation about the recipient's work. The first word must NOT be a greeting (${greetings}).`,
    "- Ground every claim strictly in the facts above. Do not invent facts, numbers, or titles.",
    `- Do NOT use any of these phrases: ${BANNED_PHRASES.join("; ")}.`,
  ].join("\n");
}

/** Parsed model response (fields present depend on the channel contract). */
export interface ParsedDraft {
  subject: string | null;
  body: string;
  has_genuine_opportunity: boolean | null;
}

/** Parse a model response (JSON per the channel contract, or plain text). */
export function parseDraftResponse(raw: string): ParsedDraft {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      return {
        subject: typeof obj.subject === "string" ? obj.subject : null,
        body: typeof obj.body === "string" ? obj.body : "",
        has_genuine_opportunity:
          typeof obj.has_genuine_opportunity === "boolean" ? obj.has_genuine_opportunity : null,
      };
    } catch {
      // fall through to plain text
    }
  }
  return { subject: null, body: trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(), has_genuine_opportunity: null };
}

/** Wrap a base prompt with corrective instructions for the single regeneration. */
export function withRegenInstructions(basePrompt: string, violations: string[]): string {
  return [
    "IMPORTANT: The previous draft FAILED these checks. Fix ALL of them. Return only valid JSON.",
    ...violations.map((v) => `- ${v}`),
    "",
    basePrompt,
  ].join("\n");
}
