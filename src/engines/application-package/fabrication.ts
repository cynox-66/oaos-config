// fabrication.ts
// File: src/engines/application-package/fabrication.ts
// Purpose: The pure (no-LLM) fabrication trace-check (GAP B). Compares every
//          sentence of the cover letter against the allowed corpus (base resume
//          + evidence inventory + opportunity text) and flags untraceable
//          claims, years-of-experience claims, and titles absent from the base.
//
//  NOTE: Only the cover_letter is checked. The resume_variant is a pure reorder
//  of base content (see resume.ts) and cannot introduce fabrication by
//  construction, so it is intentionally not re-checked here.

import type { BaseResume, Evidence, FabricationResult, Opportunity } from "./types";
import {
  FABRICATION_SUSPICIOUS_LIMIT,
  MIN_TOKEN_LENGTH,
  TITLE_KEYWORDS,
  YEARS_OF_EXPERIENCE_REGEX,
} from "./config";

/** Lowercase, split on non-alphanumeric, keep tokens longer than MIN_TOKEN_LENGTH. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > MIN_TOKEN_LENGTH);
}

/** Collapse whitespace and lowercase. */
function collapseLower(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** All base-resume text concatenated (for the years-of-experience trace). */
export function baseResumeText(base: BaseResume): string {
  return [
    base.name,
    base.summary,
    ...base.experience.flatMap((e) => [e.company, e.title, e.dates, ...e.bullets]),
    ...base.projects.flatMap((p) => [p.name, p.url ?? "", p.description, ...p.bullets, ...p.tech_tags]),
    ...base.education.flatMap((e) => [e.institution, e.degree, e.dates]),
    ...base.skills,
  ].join(" ");
}

/** Concatenated base-resume titles (for the title trace). */
function baseTitlesText(base: BaseResume): string {
  return base.experience.map((e) => e.title).join(" ").toLowerCase();
}

/** Tokens of the allowed corpus: base resume + inventory + opportunity text. */
export function allowedTokens(
  base: BaseResume,
  inventory: Evidence[],
  opportunity: Opportunity,
  roleDescription: string
): Set<string> {
  const strings = [
    baseResumeText(base),
    ...inventory.flatMap((e) => [e.title, e.relevance_blurb, ...e.tech_tags, ...e.domains]),
    opportunity.company,
    opportunity.role,
    roleDescription,
  ];
  return new Set(tokenize(strings.join(" ")));
}

/** Split a letter into sentences. */
export function splitSentences(letter: string): string[] {
  return letter
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Fabrication trace-check on a cover letter (GAP B). Pure and deterministic.
 *
 * @param letter the generated cover letter.
 * @param base the operator's base resume (the source of truth for claims).
 * @param inventory the evidence inventory (additional allowed corpus).
 * @param opportunity the opportunity (company/role allowed in the hook).
 * @param roleDescription the role description string (allowed corpus).
 */
export function checkFabrication(
  letter: string,
  base: BaseResume,
  inventory: Evidence[],
  opportunity: Opportunity,
  roleDescription: string
): FabricationResult {
  const allowed = allowedTokens(base, inventory, opportunity, roleDescription);
  const baseText = collapseLower(baseResumeText(base));
  const titles = baseTitlesText(base);

  const flagged: string[] = [];
  for (const sentence of splitSentences(letter)) {
    if (isFabricated(sentence, allowed, baseText, titles)) flagged.push(sentence);
  }

  return {
    fabrication_check: flagged.length > 0 ? "flag" : "pass",
    flagged_sentences: flagged,
  };
}

function isFabricated(
  sentence: string,
  allowed: Set<string>,
  baseText: string,
  titles: string
): boolean {
  // Hard rule: years-of-experience claim not present verbatim in the base.
  const yoe = sentence.match(YEARS_OF_EXPERIENCE_REGEX);
  if (yoe && !baseText.includes(collapseLower(yoe[0]))) return true;

  // Hard rule: a seniority/title keyword not present in the base resume's titles.
  for (const kw of TITLE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(sentence) && !titles.includes(kw)) return true;
  }

  // Soft rule: too many unsupported tokens.
  const suspicious = tokenize(sentence).filter((t) => !allowed.has(t)).length;
  return suspicious > FABRICATION_SUSPICIOUS_LIMIT;
}
