// prompt.ts
// File: src/engines/scoring/prompt.ts
// Purpose: Pure prompt construction for the LLM pass. buildPrompt is
//          deterministic and testable (no I/O). The rubric factor definitions
//          for the three LLM-scored factors are inlined here, mirroring
//          scoring/rubric.md Factors 1 (Domain Alignment), 3 (Career Leverage),
//          and 5 (OSS Tech Overlap).

import type { ScoreRequest } from "./types";

/**
 * Full rubric definitions for the THREE factors the LLM scores. Mirrors
 * scoring/rubric.md; kept inline so buildPrompt stays pure (no file reads).
 */
export const RUBRIC_LLM_FACTORS = `QUALITY — Factor: Domain Alignment (quality_domain, integer 0-15)
  13-15: Core product is Kubernetes, eBPF, chaos engineering, runtime security, or cloud-native infrastructure.
  9-12 : Adjacent to cloud-native: DevTools, general Infra, platform engineering, observability.
  4-8  : Generic tech company with some cloud usage.
  0-3  : No alignment with the target domain (cloud-native / Kubernetes / security / eBPF).

QUALITY — Factor: Career Leverage (quality_leverage, integer 0-15)
  13-15: LFX Mentorship, GSoC, or equivalent structured OSS program with a mentor.
  10-12: Seed/early startup with < 30 engineers — direct exposure to technical decisions.
  6-9  : Growth startup (30-200 engineers) — good exposure but more process.
  2-5  : Corporate internship — structured but lower leverage.
  0-1  : No meaningful career compound.

MATCH — Factor: OSS Tech Overlap (match_overlap, integer 0-20)
  18-20: Work maps DIRECTLY to their stack (e.g. they use KubeArmor, contribute to Krkn, or share the same eBPF security focus).
  13-17: Significant adjacent overlap (same ecosystem, different tools — e.g. both do chaos engineering on K8s).
  7-12 : Partial overlap (both use Kubernetes, but at a different layer).
  2-6  : General K8s / cloud-native knowledge applies but no specific overlap.
  0-1  : No meaningful OSS tech overlap.`;

/** Exact prefix prepended on the single retry after an unparseable response. */
export const STRICT_RETRY_PREFIX =
  "IMPORTANT: Return only valid JSON. No markdown. No prose. Start your response with { and end with }.";

const OUTPUT_CONTRACT = `Return ONLY this JSON object and nothing else (no markdown, no prose):
{
  "quality_domain": <integer 0-15>,
  "quality_leverage": <integer 0-15>,
  "match_overlap": <integer 0-20>,
  "rationale": "<2-3 sentence string>"
}`;

/** Compact summary of the candidate's known evidence/contact context. */
function contextSummary(request: ScoreRequest): string {
  const { opportunity, research, contacts, evidence_match } = request;
  const domains = opportunity.domain.length ? opportunity.domain.join(", ") : "(none derived)";
  const comp =
    opportunity.comp_basis === "unknown"
      ? "unknown"
      : `${opportunity.comp_basis} (min ${opportunity.comp_min ?? "n/a"}, max ${opportunity.comp_max ?? "n/a"} INR)`;
  const researchLine = research
    ? `stage=${research.stage ?? "unknown"}, oss_involvement=${research.oss_involvement ?? "unknown"}`
    : "(no research available — score from opportunity text alone)";
  const evidenceLine =
    evidence_match && typeof evidence_match.top_score === "number"
      ? `best evidence fit top_score=${evidence_match.top_score}`
      : "(no matched evidence)";
  const contactLine = contacts.length
    ? `${contacts.length} contact(s) known`
    : "(no contacts)";

  return [
    `Company: ${opportunity.company || "(unknown)"}`,
    `Role: ${opportunity.role || "(unknown)"}`,
    `Category: ${opportunity.category}`,
    `Domains: ${domains}`,
    `Compensation: ${comp}`,
    `Remote: ${opportunity.remote}`,
    `Research: ${researchLine}`,
    `Evidence: ${evidenceLine}`,
    `Contacts: ${contactLine}`,
    `Description: ${opportunity.description_norm || "(empty)"}`,
  ].join("\n");
}

/**
 * Build the Gemini prompt for the LLM pass. Pure and deterministic for a given
 * request. Scores exactly three judgment factors against the rubric.
 */
export function buildPrompt(request: ScoreRequest): string {
  return [
    "You are scoring a job/opportunity for a cloud-native / Kubernetes / eBPF security engineer.",
    "Score EXACTLY three factors using the rubric below. Use integers within the stated ranges.",
    "",
    "=== RUBRIC ===",
    RUBRIC_LLM_FACTORS,
    "",
    "=== OPPORTUNITY CONTEXT ===",
    contextSummary(request),
    "",
    "=== OUTPUT ===",
    OUTPUT_CONTRACT,
  ].join("\n");
}
