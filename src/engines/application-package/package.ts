// package.ts
// File: src/engines/application-package/package.ts
// Purpose: Orchestrator for the Application Package Engine (Engine 6): build the
//          resume variant (pure), resolve the proof-point evidence, generate the
//          cover letter (with fabrication/word-count handling), and assemble the
//          ApplicationPackage.

import { createGeminiClient } from "../scoring/gemini";
import type {
  ApplicationPackage,
  Evidence,
  GeminiClient,
  PackageOptions,
  PackageRequest,
} from "./types";
import { PROOF_POINT_COUNT } from "./config";
import { buildResumeVariant } from "./resume";
import { generateCoverLetter } from "./letter";

/** Resolve the first ≤2 ranked evidence_ids to full Evidence objects (GAP D). */
function resolveProofEvidence(request: PackageRequest): Evidence[] {
  const byId = new Map(request.inventory.map((e) => [e.id, e]));
  return request.match.ranked
    .slice(0, PROOF_POINT_COUNT)
    .map((r) => byId.get(r.evidence_id))
    .filter((e): e is Evidence => e !== undefined);
}

/**
 * Generate an application package (resume variant + cover letter) for an
 * Apply/Both opportunity. The resume variant is pure; the cover letter uses the
 * injectable Gemini client (≤5 calls — one generation, one reviewer critique
 * (D8), one semantic fabrication audit, at most one regeneration plus its
 * semantic re-check; happy path 3).
 *
 * @param request opportunity + match + inventory + base resume + operator + role.
 * @param options.client injected Gemini client (defaults to a real one).
 */
export async function buildApplicationPackage(
  request: PackageRequest,
  options: PackageOptions = {}
): Promise<ApplicationPackage> {
  const proofEvidence = resolveProofEvidence(request);
  const evidence_cited = proofEvidence.map((e) => e.id);

  const resume_variant = buildResumeVariant(
    request.base_resume,
    request.opportunity,
    request.match,
    request.inventory
  );

  const client: GeminiClient = options.client ?? createGeminiClient();
  const { letter, fabrication, truncated, criticEditsApplied } = await generateCoverLetter(
    request,
    proofEvidence,
    client
  );

  const notes: string[] = [];
  if (request.match.ranked.length === 0) {
    notes.push(
      "proof thin: no matched evidence — letter leads with capability and learning trajectory; verify claims before submit."
    );
  }
  if (fabrication.fabrication_check === "flag") {
    notes.push("fabrication check flagged — review flagged sentences before submit.");
  }
  if (fabrication.review_only_sentences.length > 0) {
    notes.push(
      `${fabrication.review_only_sentences.length} review-only flag(s) (token rule; paraphrase vocabulary) — no regen; verify before submit.`
    );
  }
  if (fabrication.semantic_degraded) {
    notes.push(
      "fabrication semantic layer degraded (LLM error) — hard rules only; verify claims manually before submit."
    );
  }
  if (truncated) {
    notes.push("letter truncated to 250 words.");
  }
  if (criticEditsApplied > 0) {
    notes.push(`reviewer pass: ${criticEditsApplied} edit(s) applied.`);
  }
  if (request.match.coverage_gap) {
    notes.push(`coverage gap: ${request.match.coverage_gap}.`);
  }

  return {
    resume_variant,
    cover_letter: letter,
    evidence_cited,
    fabrication_check: fabrication.fabrication_check,
    flagged_sentences: fabrication.flagged_sentences,
    review_only_sentences: fabrication.review_only_sentences,
    semantic_degraded: fabrication.semantic_degraded ?? false,
    notes: notes.join(" "),
  };
}
