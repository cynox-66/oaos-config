// research.ts
// File: src/pipeline/research.ts
// Purpose: Research enrichment for the intake pipeline (pipeline step 2).
//          Given a normalized Opportunity, ask Gemini to profile the company
//          and return a structured ResearchResult. Engine 2 reads only
//          `stage` and `oss_involvement` from this; the remaining fields are
//          preserved verbatim (Engine 2 hashes the whole object and future
//          steps may consume them). Mirrors prompts/company-research.md.
//
//          Failure contract: ANY failure — transport throw, empty/non-JSON
//          response, or JSON.parse error — resolves to `null`. This is the
//          SAME graceful-degradation signal the old stub emitted, so Engine 2's
//          degraded-confidence path (research→null ⇒ quality.stage default 3,
//          quality.oss 0, −0.3 confidence weight) is preserved unchanged. No
//          new failure mode is introduced; this function never throws.

import type { Opportunity } from "../engines/normalization/types";
import type { GeminiClient } from "../engines/scoring/types";

/**
 * Structured company research. Mirrors the JSON contract in
 * prompts/company-research.md. Structurally assignable to Engine 2's opaque
 * `Research` view (which reads only `stage` + `oss_involvement`).
 */
export interface ResearchResult {
  company: string;
  description: string;
  tech_stack: string[];
  primary_language: string;
  /** Drives Engine 2 quality.oss. "none" | "uses" | "contributes" | "maintains". */
  oss_involvement: string;
  oss_projects: string[];
  kubernetes_usage: string;
  ebpf_usage: string;
  security_focus: string;
  hiring_signals: string[];
  careers_url: string;
  key_engineers: Array<{
    name: string;
    title: string;
    github: string;
    linkedin: string;
  }>;
  /** Drives Engine 2 quality.stage. "seed"|"series-a"|"series-b"|"growth"|"public"|"unknown". */
  stage: string;
  employee_count_estimate: string;
  yc_backed: boolean;
  cncf_member: boolean;
  suggested_quality_score: number;
  scoring_rationale: string;
}

/**
 * Build the company-research prompt. Pure and deterministic (no I/O) — mirrors
 * prompts/company-research.md so it stays in sync with the frozen field
 * contract without a runtime file read (same convention as scoring/prompt.ts).
 */
export function buildResearchPrompt(opportunity: Opportunity): string {
  const companyName = opportunity.company;
  const companyUrl = opportunity.url ?? "(unknown)";

  return `You are a research assistant helping a cloud-native engineer evaluate companies for internship and OSS opportunity fit.

The engineer's profile:
- First-year B.Tech CSE(AI) student
- Active OSS contributor: Krkn Chaos (chaos engineering), KubeArmor (eBPF security), Antrea (K8s CNI)
- Stack: TypeScript, React, Node.js, NestJS, Kubernetes, Go (learning), Rust (learning)
- Target roles: internship, OSS mentorship, startup engineering
- Focus areas: cloud-native, infrastructure, security, developer tooling

Return structured JSON only. No prose. No markdown fences. No explanation.

Research this company: ${companyName}
Website: ${companyUrl}

Return this exact JSON structure with no additional text:

{
  "company": "",
  "description": "",
  "tech_stack": [],
  "primary_language": "",
  "oss_involvement": "",
  "oss_projects": [],
  "kubernetes_usage": "",
  "ebpf_usage": "",
  "security_focus": "",
  "hiring_signals": [],
  "careers_url": "",
  "key_engineers": [
    {
      "name": "",
      "title": "",
      "github": "",
      "linkedin": ""
    }
  ],
  "stage": "",
  "employee_count_estimate": "",
  "yc_backed": false,
  "cncf_member": false,
  "suggested_quality_score": 0,
  "scoring_rationale": ""
}

FIELD DEFINITIONS
description: 2 sentences max. What does the company do and who is their customer.
tech_stack: Array of technologies they use. Focus on: Go, Rust, Kubernetes, eBPF, Cilium, containers, cloud providers.
primary_language: The main programming language used in their core product.
oss_involvement: One of: "none" | "uses" | "contributes" | "maintains".
oss_projects: Array of OSS project names they maintain or heavily contribute to.
kubernetes_usage: One of: "none" | "uses" | "core-product" | "contributes".
ebpf_usage: One of: "none" | "peripheral" | "core".
security_focus: One of: "none" | "peripheral" | "core".
hiring_signals: Array of strings (e.g. "open roles on LinkedIn", "recent Series A announcement").
stage: One of: "seed" | "series-a" | "series-b" | "growth" | "public" | "unknown".
employee_count_estimate: String (e.g. "50-100", "10-20", "500+").
suggested_quality_score: Integer 0-50.
scoring_rationale: 1-2 sentences explaining the suggested score.`;
}

/** Extract a JSON object substring, tolerating code fences / surrounding prose. */
function extractJsonObject(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return stripped.slice(start, end + 1);
}

/**
 * Research enrichment step. Returns a structured {@link ResearchResult} on
 * success, or `null` on ANY failure (transport, empty/non-JSON, parse error).
 * Never throws — the null signal drives Engine 2's degraded-confidence path.
 *
 * @param opportunity the normalized opportunity to research.
 * @param client injectable Gemini client (reused from scoring).
 */
export async function researchOpportunity(
  opportunity: Opportunity,
  client: GeminiClient
): Promise<ResearchResult | null> {
  let raw: string;
  try {
    raw = await client.generate(buildResearchPrompt(opportunity));
  } catch {
    return null;
  }

  const json = extractJsonObject(raw);
  if (json === null) return null;

  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object") return null;
    return parsed as ResearchResult;
  } catch {
    return null;
  }
}
