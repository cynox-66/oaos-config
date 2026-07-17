// prompt.ts
// File: src/engines/application-package/prompt.ts
// Purpose: Pure cover-letter prompt construction (tone by category, structure,
//          word cap, grounding) and the stricter regeneration prompt. The
//          network call lives in letter.ts via the injected Gemini client.

import type { Evidence, PackageRequest } from "./types";
import { DEFAULT_TONE, MAX_LETTER_WORDS, TONE_BY_CATEGORY } from "./config";

/** Tone instruction for a category (startup = builder; else credentialed). */
export function toneFor(category: string): string {
  return TONE_BY_CATEGORY[category] ?? DEFAULT_TONE;
}

const OUTPUT_CONTRACT = `Return ONLY this JSON and nothing else:
{ "letter": "<the cover letter text>" }`;

/** Compact, grounded context block (base resume highlights + operator + opp). */
export function contextBlock(request: PackageRequest): string {
  const { opportunity, base_resume, operator, role_description } = request;
  const topExperience = base_resume.experience
    .slice(0, 3)
    .map((e) => `- ${e.title} @ ${e.company} (${e.dates}): ${e.bullets.join("; ")}`)
    .join("\n");
  return [
    `Company: ${opportunity.company}`,
    `Role: ${opportunity.role}`,
    `Role description: ${role_description || "(none provided)"}`,
    `Operator: ${operator.name} · github ${operator.github} · ${operator.portfolio_url}`,
    `Stack: ${operator.stack.join(", ")}`,
    `Base resume summary: ${base_resume.summary}`,
    `Base resume experience:\n${topExperience}`,
  ].join("\n");
}

/** Render the proof-point evidence (or the sparse-evidence instruction). */
export function proofBlock(proofEvidence: Evidence[]): string {
  if (proofEvidence.length === 0) {
    return "No matched evidence is available. Lead with capability and a learning trajectory. Do NOT invent projects or claims.";
  }
  const lines = proofEvidence
    .map((e, i) => `Proof ${i + 1}: ${e.title} — ${e.relevance_blurb} (${e.url})`)
    .join("\n");
  return `Cite exactly these ${proofEvidence.length} proof point(s), and nothing beyond what they state:\n${lines}`;
}

/**
 * Build the cover-letter prompt. Pure and deterministic for a given request.
 * Enforces tone by category, the hook→2-proof→fit/ask structure, the word cap,
 * and strict grounding in the base resume + matched evidence + opportunity.
 */
export function buildCoverLetterPrompt(request: PackageRequest, proofEvidence: Evidence[]): string {
  return [
    "Write a cover letter for the opportunity below.",
    `Hard limit: ${MAX_LETTER_WORDS} words.`,
    toneFor(request.opportunity.category),
    "Structure: (1) a hook specific to the company and role, (2) two proof points citing the evidence, (3) fit + a clear ask.",
    "Ground EVERY claim strictly in the base resume, the cited evidence, and the opportunity. Do not invent facts, projects, years of experience, or titles.",
    "",
    "=== CONTEXT ===",
    contextBlock(request),
    "",
    "=== EVIDENCE ===",
    proofBlock(proofEvidence),
    "",
    "=== OUTPUT ===",
    OUTPUT_CONTRACT,
  ].join("\n");
}

/**
 * Build the single regeneration prompt: re-emphasizes the word limit and quotes
 * the previously-flagged sentences as forbidden (GAP C combined budget).
 */
export function buildRegenPrompt(
  request: PackageRequest,
  proofEvidence: Evidence[],
  forbiddenClaims: string[]
): string {
  const forbidden =
    forbiddenClaims.length > 0
      ? `Do NOT make any of these claims (they were unverifiable):\n${forbiddenClaims.map((s) => `- "${s}"`).join("\n")}`
      : "Keep every claim grounded in the base resume and cited evidence.";
  return [
    `IMPORTANT: Hard limit ${MAX_LETTER_WORDS} words. Return only valid JSON.`,
    forbidden,
    "",
    buildCoverLetterPrompt(request, proofEvidence),
  ].join("\n");
}

/** Parse a letter from a raw model response (JSON `{letter}` or plain text). */
export function parseLetter(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1)) as { letter?: unknown };
      if (typeof obj.letter === "string") return obj.letter.trim();
    } catch {
      // fall through to plain-text handling
    }
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
