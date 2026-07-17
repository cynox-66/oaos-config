// critic.ts
// File: src/engines/application-package/critic.ts
// Purpose: The reviewer pass (research decision D8): one Gemini critic call that
//          returns structured sentence edits making the drafted cover letter more
//          specific and less templated. Edits are applied by exact string match
//          (pure), and the EXISTING fabrication trace-check runs on the revised
//          letter afterwards (see letter.ts) — the critic can never bypass it.
//          Prompt construction, parsing, and application are all pure; the
//          network call lives in letter.ts via the injected client.

import type { Evidence, PackageRequest } from "./types";
import { MAX_LETTER_WORDS } from "./config";
import { contextBlock, proofBlock } from "./prompt";

/** One structured edit returned by the critic. `old` must match the draft verbatim. */
export interface CriticEdit {
  old: string;
  new: string;
  reason?: string;
}

const CRITIC_OUTPUT_CONTRACT = `Return ONLY this JSON and nothing else:
{ "edits": [ { "old": "<exact sentence copied verbatim from the draft>", "new": "<replacement text>", "reason": "<one line>" } ] }
Return { "edits": [] } if the draft is already specific.`;

/**
 * Build the critic prompt: sharpen generic/templated phrasing using ONLY facts
 * already present in the provided context and evidence. Pure and deterministic
 * for a given request + draft.
 */
export function buildCriticPrompt(
  request: PackageRequest,
  proofEvidence: Evidence[],
  draft: string
): string {
  return [
    "You are reviewing a cover-letter draft before it goes to a human for final review.",
    "Your ONLY job is to make the letter more specific and less templated:",
    "- Cut or replace generic filler (e.g. \"my background aligns with\", \"I am excited about\", \"your initiatives\") with concrete phrasing.",
    "- Sharpen vague sentences using ONLY facts already present in the context and evidence below.",
    "- NEVER add facts, projects, numbers, years of experience, titles, or skills that do not appear in the context and evidence below.",
    `- The letter must stay under ${MAX_LETTER_WORDS} words after your edits.`,
    "- Each \"old\" value must be copied verbatim from the draft so it can be string-matched.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    proofBlock(proofEvidence),
    "",
    "=== DRAFT ===",
    draft,
    "",
    "=== OUTPUT ===",
    CRITIC_OUTPUT_CONTRACT,
  ].join("\n");
}

/**
 * Parse the critic's structured edits from a raw model response. Tolerates code
 * fences and surrounding prose. Any parse failure, wrong shape, or invalid entry
 * degrades to zero edits — the draft then proceeds unchanged (and is still
 * fabrication-checked), never a crash.
 */
export function parseCriticEdits(raw: string): CriticEdit[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return [];
  }
  const edits = (parsed as { edits?: unknown }).edits;
  if (!Array.isArray(edits)) return [];
  return edits.filter(
    (e): e is CriticEdit =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as CriticEdit).old === "string" &&
      typeof (e as CriticEdit).new === "string" &&
      (e as CriticEdit).old.trim() !== "" &&
      (e as CriticEdit).old !== (e as CriticEdit).new
  );
}

/**
 * Apply structured edits by exact string match (first occurrence each). Edits
 * whose `old` does not appear verbatim in the letter are skipped. Pure.
 *
 * @returns the revised letter and how many edits were actually applied.
 */
export function applyEdits(
  letter: string,
  edits: CriticEdit[]
): { letter: string; applied: number } {
  let revised = letter;
  let applied = 0;
  for (const edit of edits) {
    if (revised.includes(edit.old)) {
      revised = revised.replace(edit.old, edit.new);
      applied += 1;
    }
  }
  return { letter: revised, applied };
}
