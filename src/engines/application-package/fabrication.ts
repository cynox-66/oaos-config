// fabrication.ts
// File: src/engines/application-package/fabrication.ts
// Purpose: Layer 1 of the fabrication check (GAP B) — the pure, deterministic,
//          no-LLM floor. Four rules per sentence: three HARD (years-of-
//          experience not in base, title keywords absent from base,
//          untraceable puffery phrases) and one REVIEW-ONLY (too many
//          unsupported CONTENT tokens, connective stopwords excluded). Hard
//          flags trigger regeneration; review-only flags are surfaced for
//          human review but never trigger regen alone. Layer 2 (semantic.ts)
//          can only ADD flags on top of this result, never clear one.
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
  const reviewOnly: string[] = [];
  for (const sentence of splitSentences(letter)) {
    const cls = classifySentence(sentence, allowed, baseText, titles);
    if (cls === null) continue;
    flagged.push(sentence);
    if (cls === "review") reviewOnly.push(sentence);
  }

  return {
    fabrication_check: flagged.length > 0 ? "flag" : "pass",
    flagged_sentences: flagged,
    review_only_sentences: reviewOnly,
  };
}

/**
 * True iff regeneration should fire: at least one flagged sentence was flagged
 * by a hard net (1 YoE / 2 title / 3 puffery / 5 semantic) — i.e. is NOT
 * review-only. Net-4-only flags never trigger regeneration on their own; they
 * pass through for human review instead (and never block a regen another net
 * earned). Explicit set-difference, not length arithmetic: stays correct even
 * if a future edit dedupes flagged_sentences or double-buckets a sentence.
 */
export function requiresRegen(result: FabricationResult): boolean {
  const reviewOnly = new Set(result.review_only_sentences);
  return result.flagged_sentences.some((s) => !reviewOnly.has(s));
}

/**
 * Classify one sentence: "hard" when a hard net (YoE / title / puffery) fires,
 * "review" when only the token rule (net 4) fires, null when clean. The four
 * predicates are the pre-existing detection rules, unchanged — only the
 * aggregation (which net fired) is new.
 */
function classifySentence(
  sentence: string,
  allowed: Set<string>,
  baseText: string,
  titles: string
): "hard" | "review" | null {
  // Hard rule: years-of-experience claim not present verbatim in the base.
  const yoe = sentence.match(YEARS_OF_EXPERIENCE_REGEX);
  if (yoe && !baseText.includes(collapseLower(yoe[0]))) return "hard";

  // Hard rule: a seniority/title keyword not present in the base resume's titles.
  for (const kw of TITLE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(sentence) && !titles.includes(kw)) return "hard";
  }

  // Hard rule: a puffery phrase not present verbatim in the base resume.
  // (The same variation-tolerant regex checks both sides, so "world class"
  // in the letter is traceable to "world-class" in the base.)
  for (const re of PUFFERY_REGEXES) {
    if (re.test(sentence) && !re.test(baseText)) return "hard";
  }

  // Review-only rule (narrowed token rule): too many unsupported CONTENT
  // tokens. Connective stopwords never count, so grammar and rhetoric cost
  // nothing; every counted token is content-bearing (fails closed on unknown
  // words). Flags for human review but does not trigger regeneration alone.
  const suspicious = tokenize(sentence).filter(
    (t) => !allowed.has(t) && !CONNECTIVE_STOPWORDS.has(t)
  ).length;
  return suspicious > FABRICATION_SUSPICIOUS_LIMIT ? "review" : null;
}
