// prompt.ts
// File: src/engines/evidence-matching/prompt.ts
// Purpose: Reason-generation prompts and the hard fabrication trace-check
//          (GAP F). All pure and testable; the network call lives in match.ts
//          via the injected Gemini client.

import type { Evidence, Opportunity } from "./types";
import {
  FABRICATION_SUSPICIOUS_LIMIT,
  FALLBACK_REASON_MAX_CHARS,
  MIN_TOKEN_LENGTH,
} from "./config";

/** Lowercase, split on non-alphanumeric, keep tokens longer than MIN_TOKEN_LENGTH. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > MIN_TOKEN_LENGTH);
}

/** The allowed-token set for an asset's reason: blurb + role + description. */
export function allowedTokens(evidence: Evidence, opportunity: Opportunity): Set<string> {
  return new Set(
    tokenize(
      `${evidence.relevance_blurb} ${opportunity.role} ${opportunity.description_norm}`
    )
  );
}

/**
 * Count reason tokens not present in the allowed set. A reason is "fabricated"
 * (and rejected) when this exceeds {@link FABRICATION_SUSPICIOUS_LIMIT}.
 */
export function countSuspiciousTokens(
  reason: string,
  evidence: Evidence,
  opportunity: Opportunity
): number {
  const allowed = allowedTokens(evidence, opportunity);
  return tokenize(reason).filter((t) => !allowed.has(t)).length;
}

/** Whether a reason should be rejected as fabricated. */
export function isFabricated(
  reason: string,
  evidence: Evidence,
  opportunity: Opportunity
): boolean {
  return (
    countSuspiciousTokens(reason, evidence, opportunity) > FABRICATION_SUSPICIOUS_LIMIT
  );
}

/** Deterministic fallback reason: the relevance_blurb, truncated. */
export function fallbackReason(evidence: Evidence): string {
  return evidence.relevance_blurb.slice(0, FALLBACK_REASON_MAX_CHARS);
}

const OUTPUT_CONTRACT = `Return ONLY this JSON and nothing else:
{ "reason": "<one sentence>" }`;

/** First-pass reason prompt for a single asset. */
export function buildReasonPrompt(evidence: Evidence, opportunity: Opportunity): string {
  return [
    "Write ONE short sentence explaining why this evidence asset proves capability for this opportunity.",
    "Ground it strictly in the asset blurb and the opportunity text below. Do not invent facts.",
    "",
    `Asset: ${evidence.title} (${evidence.type})`,
    `Asset proves: ${evidence.relevance_blurb}`,
    `Opportunity role: ${opportunity.role}`,
    `Opportunity description: ${opportunity.description_norm}`,
    "",
    OUTPUT_CONTRACT,
  ].join("\n");
}

/**
 * Stricter retry prompt used after a fabricated first reason: quotes the
 * allowed source text and forbids outside words.
 */
export function buildStrictReasonPrompt(evidence: Evidence, opportunity: Opportunity): string {
  return [
    "IMPORTANT: Use ONLY words that appear in the source text quoted below. Do not introduce any new facts, tools, or terms.",
    "",
    "=== ALLOWED SOURCE TEXT ===",
    `"${evidence.relevance_blurb}"`,
    `"${opportunity.role}"`,
    `"${opportunity.description_norm}"`,
    "",
    "Write ONE short sentence on why this asset fits the opportunity, using only those words.",
    "",
    OUTPUT_CONTRACT,
  ].join("\n");
}

/** Parse a reason from a raw model response (JSON `{reason}` or plain text). */
export function parseReason(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1)) as { reason?: unknown };
      if (typeof obj.reason === "string") return obj.reason.trim();
    } catch {
      // fall through to plain-text handling
    }
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
