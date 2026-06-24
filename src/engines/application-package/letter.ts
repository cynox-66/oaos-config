// letter.ts
// File: src/engines/application-package/letter.ts
// Purpose: Cover-letter generation via Gemini, with the single combined
//          regeneration budget (fabrication OR word-count failure → one retry)
//          and a final hard word-cap truncation (GAP C). The only module here
//          that performs a network call (through the injected client).

import type { Evidence, FabricationResult, GeminiClient, PackageRequest } from "./types";
import { MAX_LETTER_WORDS } from "./config";
import { buildCoverLetterPrompt, buildRegenPrompt, parseLetter } from "./prompt";
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
}

/**
 * Generate the cover letter. Flow (GAP C): generate → check fabrication AND word
 * count → if either fails, regenerate ONCE with combined corrective instructions
 * → re-check → if still over the cap, hard-truncate. Total Gemini calls ≤ 2.
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
  let fabrication = check(letter);
  let overLimit = wordCount(letter) > MAX_LETTER_WORDS;

  // One regeneration if fabrication flagged OR the letter is too long.
  if (fabrication.fabrication_check === "flag" || overLimit) {
    const regen = buildRegenPrompt(request, proofEvidence, fabrication.flagged_sentences);
    letter = parseLetter(await client.generate(regen));
    fabrication = check(letter);
    overLimit = wordCount(letter) > MAX_LETTER_WORDS;
  }

  // Persistent over-length → hard truncate (fabrication result stands).
  let truncated = false;
  if (overLimit) {
    letter = truncateToWords(letter, MAX_LETTER_WORDS);
    truncated = true;
  }

  return { letter, fabrication, truncated };
}
