// prompts.ts
// File: src/engines/follow-up/prompts.ts
// Purpose: Pure per-step follow-up prompt builders, the response parser, and the
//          follow-up constraint check. Reuses Engine 7's banned phrases,
//          greeting openers, wordCount, and normalizeText (imported, not copied)
//          but applies PER-STEP word caps (60/50/40) rather than per-channel.

import type { ConstraintResult } from "../outreach-package/types";
import { GREETING_OPENERS } from "../outreach-package/config";
import { normalizeText, wordCount } from "../outreach-package/constraints";
import type { FollowUpRequest } from "./types";
import { BANNED_PHRASES, WORD_CAP_BY_FU } from "./config";

// ============================================================
// Prompt construction (pure)
// ============================================================

function contextBlock(request: FollowUpRequest): string {
  const { contact, opportunity } = request;
  return [
    `Recipient: ${contact.name} — ${contact.title} at ${contact.company}`,
    `Opportunity: ${opportunity.role} at ${opportunity.company}`,
    `Original outreach was on: ${request.channel}.`,
    request.recent_activity ? `Recent activity by them: ${request.recent_activity}` : "",
    request.new_evidence ? `New evidence to add: ${request.new_evidence.title} — ${request.new_evidence.relevance_blurb} (${request.new_evidence.url})` : "",
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

const RULES = [
  "RULES:",
  "- Open with a specific observation, NOT a greeting (no Hi/Hello/Hey/Dear/Greetings).",
  "- Ground every claim in the facts above. Do not invent.",
  `- Do NOT use any of these phrases: ${BANNED_PHRASES.join("; ")}.`,
].join("\n");

/** Per-step intent (FU1 add value, FU2 new angle + question, FU3 graceful close). */
function stepInstruction(fu: number): string {
  if (fu === 1) {
    return [
      "This is FOLLOW-UP #1 (≤60 words). Add NEW value: a recent PR, article, or insight.",
      "Never sound like a reminder. Lead with something useful to them.",
    ].join("\n");
  }
  if (fu === 2) {
    return [
      "This is FOLLOW-UP #2 (≤50 words). Take a DIFFERENT angle from before.",
      "Reference something they recently shipped or posted, and end with an easy-to-answer question.",
    ].join("\n");
  }
  return [
    "This is FOLLOW-UP #3 (≤40 words). This is the FINAL message.",
    "Be graceful, leave the door open, and apply no guilt or pressure.",
  ].join("\n");
}

/** Build the follow-up prompt for FU number `fu` (1..3). Pure. */
export function buildFollowUpPrompt(request: FollowUpRequest, fu: number): string {
  return [
    stepInstruction(fu),
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    RULES,
    "",
    `Return ONLY this JSON: { "body": "<≤${WORD_CAP_BY_FU[fu]} words>" }`,
  ].join("\n");
}

/** Build the single regeneration prompt with violations quoted as forbidden. */
export function buildRegenPrompt(request: FollowUpRequest, fu: number, violations: string[]): string {
  return [
    "IMPORTANT: The previous draft FAILED these checks. Fix ALL of them. Return only valid JSON.",
    ...violations.map((v) => `- ${v}`),
    "",
    buildFollowUpPrompt(request, fu),
  ].join("\n");
}

/** Parse a follow-up body from a raw model response (JSON `{body}` or text). */
export function parseFollowUpResponse(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1)) as { body?: unknown };
      if (typeof obj.body === "string") return obj.body.trim();
    } catch {
      // fall through to plain text
    }
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

// ============================================================
// Constraint check (pure) — per-step word cap + banned + opener
// ============================================================

function firstWordLetters(body: string): string {
  const first = body.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Check a follow-up body against the per-step word cap, the combined banned
 * phrases (Engine 7 + follow-up-specific), and the opener (no-greeting) rule.
 * Pure and deterministic.
 *
 * @param body the follow-up body text.
 * @param fu the follow-up number (1..3), selecting the word cap.
 */
export function checkFollowUpConstraints(body: string, fu: number): ConstraintResult {
  const violations: string[] = [];

  const cap = WORD_CAP_BY_FU[fu];
  const wc = wordCount(body);
  if (wc > cap) violations.push(`body exceeds ${cap} words (${wc})`);

  const haystack = normalizeText(body);
  for (const phrase of BANNED_PHRASES) {
    if (haystack.includes(phrase)) violations.push(`banned phrase: "${phrase}"`);
  }

  if (GREETING_OPENERS.includes(firstWordLetters(body))) {
    const word = body.trim().split(/\s+/)[0] ?? "";
    violations.push(`opener is a greeting: "${word}"`);
  }

  return { pass: violations.length === 0, violations };
}
