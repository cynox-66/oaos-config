// fabrication.ts
// File: src/engines/application-package/fabrication.ts
// Purpose: Layer 1 of the fabrication check (GAP B) — the pure, deterministic,
//          no-LLM floor. Four hard rules per sentence: years-of-experience not
//          in base, title keywords absent from base, untraceable puffery
//          phrases, and too many unsupported CONTENT tokens (connective
//          stopwords excluded). Layer 2 (semantic.ts) can only ADD flags on
//          top of this result, never clear one.
//
//  NOTE: Only the cover_letter is checked. The resume_variant is a pure reorder
//  of base content (see resume.ts) and cannot introduce fabrication by
//  construction, so it is intentionally not re-checked here.

import type { BaseResume, Evidence, FabricationResult, Opportunity } from "./types";
import {
  CONNECTIVE_STOPWORDS,
  FABRICATION_SUSPICIOUS_LIMIT,
  MIN_TOKEN_LENGTH,
  PUFFERY_PATTERNS,
  TITLE_KEYWORDS,
  YEARS_OF_EXPERIENCE_REGEX,
} from "./config";

/**
 * Compile a puffery phrase to a word-boundary regex tolerating whitespace or
 * hyphens between words ("world class" matches "world-class" and vice versa).
 */
function pufferyRegex(phrase: string): RegExp {
  const parts = phrase.split(/[\s-]+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b${parts.join("[\\s-]+")}\\b`, "i");
}

const PUFFERY_REGEXES = PUFFERY_PATTERNS.map(pufferyRegex);

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

/** Tokens of the allowed corpus: base resume + inventory + opportunity text.
 *  Inventory URLs are included: citing an evidence record's own address can
 *  never be fabrication. */
export function allowedTokens(
  base: BaseResume,
  inventory: Evidence[],
  opportunity: Opportunity,
  roleDescription: string
): Set<string> {
  const strings = [
    baseResumeText(base),
    ...inventory.flatMap((e) => [e.title, e.relevance_blurb, e.url ?? "", ...e.tech_tags, ...e.domains]),
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
 * Layer-1 fabrication trace-check on a cover letter (GAP B). Pure and
 * deterministic — evaluable with no LLM available. This is the un-bypassable
 * floor: the layered check (semantic.ts) unions Layer-2 flags on top of this
 * result and can never remove one.
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

  // Hard rule: a puffery phrase not present verbatim in the base resume.
  // (The same variation-tolerant regex checks both sides, so "world class"
  // in the letter is traceable to "world-class" in the base.)
  for (const re of PUFFERY_REGEXES) {
    if (re.test(sentence) && !re.test(baseText)) return true;
  }

  // Hard rule (narrowed token rule): too many unsupported CONTENT tokens.
  // Connective stopwords never count, so grammar and rhetoric cost nothing;
  // every counted token is content-bearing (fails closed on unknown words).
  const suspicious = tokenize(sentence).filter(
    (t) => !allowed.has(t) && !CONNECTIVE_STOPWORDS.has(t)
  ).length;
  return suspicious > FABRICATION_SUSPICIOUS_LIMIT;
}
