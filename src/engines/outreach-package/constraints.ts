// constraints.ts
// File: src/engines/outreach-package/constraints.ts
// Purpose: Pure (no-LLM), draft-intrinsic constraint checks: per-channel length
//          limits, the banned-phrase hard gate, and the opener (no-greeting)
//          rule. The single-evidence URL check lives in the orchestrator
//          (draft.ts) because it needs inventory context this function does not
//          receive.

import type { Channel, ConstraintResult, OutreachDraft } from "./types";
import { BANNED_PHRASES, CHANNEL_LIMITS, GREETING_OPENERS } from "./config";

/** Word count (whitespace-delimited, non-empty). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Lowercase, collapse whitespace, normalize curly apostrophes to straight. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first word of the body, stripped to letters (for the greeting check). */
function firstWordLetters(body: string): string {
  const first = body.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Check the draft-intrinsic constraints (length, banned phrases, opener). Pure
 * and deterministic. Does NOT verify evidence references (see draft.ts).
 *
 * @param draft the assembled draft (uses its precomputed word_count/char_count).
 * @param channel the outreach channel (selects the length limits).
 */
export function checkConstraints(draft: OutreachDraft, channel: Channel): ConstraintResult {
  const limit = CHANNEL_LIMITS[channel];
  const violations: string[] = [];

  // Length limits.
  if (limit.bodyMaxWords !== undefined && draft.word_count > limit.bodyMaxWords) {
    violations.push(`body exceeds ${limit.bodyMaxWords} words (${draft.word_count})`);
  }
  if (limit.bodyMaxChars !== undefined && draft.char_count > limit.bodyMaxChars) {
    violations.push(`body exceeds ${limit.bodyMaxChars} chars (${draft.char_count})`);
  }
  if (limit.hasSubject && limit.subjectMaxWords !== undefined) {
    const subjectWords = draft.subject ? wordCount(draft.subject) : 0;
    if (subjectWords > limit.subjectMaxWords) {
      violations.push(`subject exceeds ${limit.subjectMaxWords} words (${subjectWords})`);
    }
  }

  // Banned phrases — hard substring gate over subject + body.
  const haystack = normalizeText(`${draft.subject ?? ""} ${draft.body}`);
  for (const phrase of BANNED_PHRASES) {
    if (haystack.includes(phrase)) violations.push(`banned phrase: "${phrase}"`);
  }

  // Opener — the first word of the body must not be a greeting.
  if (GREETING_OPENERS.includes(firstWordLetters(draft.body))) {
    const word = draft.body.trim().split(/\s+/)[0] ?? "";
    violations.push(`opener is a greeting: "${word}"`);
  }

  return { pass: violations.length === 0, violations };
}
