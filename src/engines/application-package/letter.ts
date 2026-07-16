// letter.ts
// File: src/engines/application-package/letter.ts
// Purpose: Cover-letter generation via Gemini, with the reviewer critic pass
//          (D8), the single combined regeneration budget (fabrication OR
//          word-count failure → one retry) and a final hard word-cap truncation
//          (GAP C). The only module here that performs a network call (through
//          the injected client).

import type { Evidence, FabricationResult, GeminiClient, PackageRequest } from "./types";
import { MAX_LETTER_WORDS } from "./config";
import { buildCoverLetterPrompt, buildRegenPrompt, parseLetter } from "./prompt";
import { applyEdits, buildCriticPrompt, parseCriticEdits } from "./critic";
import { checkFabrication } from "./fabrication";

/** Count words (whitespace-delimited, non-empty). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Hard-truncate to at most `maxWords`, ending at the last sentence boundary that
 * fits. If even the first sentence exceeds the cap, cut at the word boundary.
 */
export function truncateToWords(text: string, maxWords: number): string {
  if (wordCount(text) <= maxWords) return text;
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let total = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (total + w > maxWords) break;
    kept.push(s);
    total += w;
  }
  if (kept.length > 0) return kept.join(" ");
  // First sentence alone is over the cap → cut at the word boundary.
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

export interface CoverLetterResult {
  letter: string;
  fabrication: FabricationResult;
  truncated: boolean;
  /** Reviewer-pass edits actually applied to the draft (D8). */
  criticEditsApplied: number;
}

/**
 * Generate the cover letter. Flow: generate → ONE critic pass returning
 * structured edits, applied by exact match (D8) → check fabrication AND word
 * count on the REVISED letter → if either fails, regenerate ONCE with combined
 * corrective instructions → re-check → if still over the cap, hard-truncate.
 * Total Gemini calls ≤ 3 (draft + critic + at most one regeneration); the
 * fabrication trace-check always runs on the final text and is never overridden
 * by the critic.
 */
export async function generateCoverLetter(
  request: PackageRequest,
  proofEvidence: Evidence[],
  client: GeminiClient
): Promise<CoverLetterResult> {
  const { base_resume, inventory, opportunity, role_description } = request;
  const check = (letter: string): FabricationResult =>
    checkFabrication(letter, base_resume, inventory, opportunity, role_description);

  let letter = parseLetter(await client.generate(buildCoverLetterPrompt(request, proofEvidence)));

  // Reviewer pass (D8): exactly one critic call; an unparseable response
  // degrades to zero edits and the draft proceeds unchanged.
  const edits = parseCriticEdits(await client.generate(buildCriticPrompt(request, proofEvidence, letter)));
  const revision = applyEdits(letter, edits);
  letter = revision.letter;

  let fabrication = check(letter);
  let overLimit = wordCount(letter) > MAX_LETTER_WORDS;

  // One regeneration if fabrication flagged OR the letter is too long. A
  // regenerated letter replaces the critic-revised text wholesale, so the
  // critic's edits no longer survive in the final letter.
  let regenerated = false;
  if (fabrication.fabrication_check === "flag" || overLimit) {
    const regen = buildRegenPrompt(request, proofEvidence, fabrication.flagged_sentences);
    letter = parseLetter(await client.generate(regen));
    fabrication = check(letter);
    overLimit = wordCount(letter) > MAX_LETTER_WORDS;
    regenerated = true;
  }

  // Persistent over-length → hard truncate (fabrication result stands).
  let truncated = false;
  if (overLimit) {
    letter = truncateToWords(letter, MAX_LETTER_WORDS);
    truncated = true;
  }

  return {
    letter,
    fabrication,
    truncated,
    criticEditsApplied: regenerated ? 0 : revision.applied,
  };
}
