// semantic.ts
// File: src/engines/application-package/semantic.ts
// Purpose: Layer 2 of the fabrication check — one Gemini call that audits the
//          letter for concrete factual claims unsupported by the allowed
//          sources — plus the layered composer that enforces THE INVARIANT:
//
//            final = flag IF (Layer 1 flags) OR (Layer 2 flags)
//
//          Layer 1 (fabrication.ts, pure) is computed first and independently;
//          Layer 2 output is UNIONED on top and can only ever ADD flags.
//          FAIL-CLOSED: an LLM error or unparseable verdict degrades to the
//          Layer-1 result with semantic_degraded=true — an LLM failure never
//          downgrades a flag to a pass, and a degraded pass is never silent
//          (surfaced in ApplicationPackage.notes + console.warn).

import type { BaseResume, Evidence, FabricationResult, GeminiClient, Opportunity } from "./types";
import { checkFabrication } from "./fabrication";

/** One unsupported concrete claim named by the Layer-2 auditor. */
export interface SemanticClaim {
  /** The offending sentence, verbatim from the letter. */
  sentence: string;
  /** The specific unsupported claim inside it. */
  claim: string;
  /** Why the auditor judged it unsupported. */
  reason: string;
}

/**
 * Build the Layer-2 auditor prompt. Pure. Serializes the COMPLETE allowed
 * sources (full base resume, full inventory) — a truncated context would make
 * the auditor flag true claims it simply wasn't shown.
 */
export function buildSemanticFabricationPrompt(
  letter: string,
  base: BaseResume,
  inventory: Evidence[],
  opportunity: Opportunity,
  roleDescription: string
): string {
  const inventoryLines = inventory.map((e) => ({
    title: e.title,
    blurb: e.relevance_blurb,
    tech_tags: e.tech_tags,
    domains: e.domains,
  }));
  return [
    "You are a strict fact-checking auditor for a job-application cover letter.",
    "",
    "ALLOWED SOURCES (the only ground truth):",
    `BASE RESUME: ${JSON.stringify(base)}`,
    `EVIDENCE INVENTORY: ${JSON.stringify(inventoryLines)}`,
    `OPPORTUNITY: ${JSON.stringify({ company: opportunity.company, role: opportunity.role, role_description: roleDescription })}`,
    "",
    "COVER LETTER TO AUDIT:",
    letter,
    "",
    "Task: list every sentence that makes a CONCRETE FACTUAL CLAIM — about",
    "experience, seniority, scale, achievements, technologies used,",
    "credentials, or employment — that is NOT supported by the allowed sources.",
    "Rules:",
    "- ALL allowed sources are equally authoritative. A claim supported by ANY",
    "  single allowed source — including the evidence inventory — is supported.",
    "  Do NOT treat the base resume as primary or require claims to appear there.",
    "- Generic connective sentences with no factual claim (greetings,",
    "  transitions, statements of interest or motivation) are NOT violations.",
    "- Faithful paraphrase of a supported fact is NOT a violation.",
    "- A claim is a violation only if it asserts something the sources do not support.",
    "",
    "Output STRICT JSON only, no prose, no code fences:",
    '{"unsupported_claims":[{"sentence":"<the sentence verbatim>","claim":"<the specific unsupported claim>","reason":"<why it is unsupported>"}]}',
    'If there are none: {"unsupported_claims":[]}',
  ].join("\n");
}

/**
 * Parse the auditor's verdict. Tolerates code fences and surrounding prose.
 * Returns the claims array on success (possibly empty — the auditor
 * affirmatively found nothing), or NULL on any deviation (not JSON, wrong
 * shape, non-string sentences). Null means "degraded", which the composer
 * treats as fail-closed — it is never conflated with an empty verdict.
 */
export function parseSemanticVerdict(raw: string): SemanticClaim[] | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const claims = (parsed as { unsupported_claims?: unknown }).unsupported_claims;
  if (!Array.isArray(claims)) return null;
  const out: SemanticClaim[] = [];
  for (const c of claims) {
    if (typeof c !== "object" || c === null) return null;
    const { sentence, claim, reason } = c as Record<string, unknown>;
    if (typeof sentence !== "string" || sentence.trim() === "") return null;
    out.push({
      sentence,
      claim: typeof claim === "string" ? claim : "",
      reason: typeof reason === "string" ? reason : "",
    });
  }
  return out;
}

/**
 * The layered fabrication check. Layer 1 (pure hard rules) runs first and
 * unconditionally; Layer 2 (semantic audit, ONE Gemini call) runs after and
 * its flags are set-unioned on top. Structural invariant: Layer-1 flagged
 * sentences are always in the union — no code path subtracts them, so the LLM
 * can escalate a pass to a flag but can never clear a hard flag.
 */
export async function checkFabricationLayered(
  letter: string,
  base: BaseResume,
  inventory: Evidence[],
  opportunity: Opportunity,
  roleDescription: string,
  client: GeminiClient
): Promise<FabricationResult> {
  const hard = checkFabrication(letter, base, inventory, opportunity, roleDescription);

  let semanticFlags: string[] = [];
  let degraded = false;
  try {
    const raw = await client.generate(
      buildSemanticFabricationPrompt(letter, base, inventory, opportunity, roleDescription)
    );
    const verdict = parseSemanticVerdict(raw);
    if (verdict === null) {
      degraded = true; // unparseable verdict → fail-closed
    } else {
      semanticFlags = verdict.map((c) => c.sentence);
    }
  } catch {
    degraded = true; // transport error/timeout → fail-closed
  }
  if (degraded) {
    console.warn(
      "[application-package] semantic fabrication layer degraded (LLM error or unparseable verdict) — hard rules only."
    );
  }

  const flagged = [...new Set([...hard.flagged_sentences, ...semanticFlags])];
  return {
    fabrication_check: flagged.length > 0 ? "flag" : "pass",
    flagged_sentences: flagged,
    semantic_degraded: degraded,
  };
}
