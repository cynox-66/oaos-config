// tests/helpers.ts
// Builders and mock Gemini clients for the Application Package engine tests.

import type { Domain, Opportunity } from "../../normalization/types";
import type { Category } from "../../normalization/types";
import type { Evidence, EvidenceMatch } from "../../evidence-matching/types";
import type { GeminiClient } from "../../scoring/types";
import type { BaseResume, OperatorProfile, PackageRequest } from "../types";

export function makeOpportunity(
  category: Category = "Job",
  domain: Domain[] = ["eBPF", "Security"]
): Opportunity {
  return {
    id: "opp_1",
    company: "Isovalent",
    role: "eBPF Security Engineer",
    category,
    domain,
    source_name: "manual",
    source_type: "job_board",
    url: null,
    description_raw: "",
    description_norm: "ebpf security cilium kubernetes",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp_test",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
  };
}

export const INVENTORY: Evidence[] = [
  {
    id: "kubearmor",
    title: "KubeArmor contributions",
    type: "PR",
    url: "https://github.com/kubearmor/KubeArmor",
    tech_tags: ["eBPF", "Security", "Kubernetes"],
    domains: ["eBPF", "Security", "Kubernetes"],
    relevance_blurb: "KubeArmor contributions proving eBPF and Linux runtime security capability.",
    recency_date: "2025-04-10",
    strength: 5,
  },
  {
    id: "krkn-chaos",
    title: "Krkn Chaos contributions",
    type: "PR",
    url: "https://github.com/krkn-chaos/krkn",
    tech_tags: ["Chaos-Engineering", "Kubernetes"],
    domains: ["Chaos-Engineering", "Kubernetes"],
    relevance_blurb: "Chaos engineering contributions proving Kubernetes resilience capability.",
    recency_date: "2025-05-01",
    strength: 5,
  },
  {
    id: "portfolio",
    title: "devjaiswal.me",
    type: "Project",
    url: "https://devjaiswal.me",
    tech_tags: ["React", "TypeScript", "Web/Frontend"],
    domains: ["Web/Frontend"],
    relevance_blurb: "Portfolio proving full-stack React and TypeScript engineering.",
    recency_date: "2025-06-01",
    strength: 3,
  },
];

export function makeBaseResume(over: Partial<BaseResume> = {}): BaseResume {
  return {
    name: "Dev Jaiswal",
    summary: "Cloud native engineer focused on Kubernetes security and eBPF.",
    experience: [
      {
        company: "AccuKnox",
        title: "Security Engineer",
        dates: "2023-2025",
        bullets: [
          "Contributed KubeArmor eBPF runtime security policies",
          "Built Kubernetes network policy enforcement",
        ],
      },
    ],
    projects: [
      {
        name: "Portfolio",
        url: "https://devjaiswal.me",
        description: "Full stack site",
        bullets: ["Built React TypeScript site"],
        tech_tags: ["React", "TypeScript", "Web/Frontend"],
      },
      {
        name: "KubeArmor",
        url: "https://github.com/kubearmor/KubeArmor",
        description: "eBPF runtime security",
        bullets: ["Implemented eBPF policy enforcement", "Wrote Kubernetes security tests"],
        tech_tags: ["eBPF", "Security", "Kubernetes"],
      },
      {
        name: "Krkn",
        description: "chaos engineering",
        bullets: ["Added chaos scenarios"],
        tech_tags: ["Chaos-Engineering", "Kubernetes"],
      },
    ],
    education: [{ institution: "IIT", degree: "BTech", dates: "2019-2023" }],
    skills: ["Kubernetes", "eBPF", "Security", "Go", "TypeScript"],
    ...over,
  };
}

export function makeOperator(): OperatorProfile {
  return {
    name: "Dev Jaiswal",
    github: "https://github.com/devjaiswal",
    portfolio_url: "https://devjaiswal.me",
    stack: ["Kubernetes", "eBPF", "Go"],
  };
}

export function makeMatch(rankedIds: string[], coverage_gap: string | null = null): EvidenceMatch {
  return {
    id: "match_1",
    ranked: rankedIds.map((id, i) => ({ evidence_id: id, fit_score: 0.9 - i * 0.1, reason: "fits" })),
    top_score: rankedIds.length ? 0.9 : 0,
    coverage_gap,
  };
}

export function makeRequest(over: Partial<PackageRequest> = {}): PackageRequest {
  return {
    opportunity: makeOpportunity(),
    match: makeMatch(["kubearmor", "krkn-chaos"]),
    inventory: INVENTORY,
    base_resume: makeBaseResume(),
    operator: makeOperator(),
    role_description: "Work on eBPF security for Kubernetes.",
    ...over,
  };
}

/** A clean cover letter using only base/inventory/opportunity terms (passes). */
export const CLEAN_LETTER =
  "Isovalent focuses on eBPF security and Kubernetes. " +
  "I contributed KubeArmor eBPF runtime security policies. " +
  "My Krkn chaos engineering work shows Kubernetes capability. " +
  "I want to contribute eBPF security at Isovalent.";

/** A letter with fabricated claims (years-of-experience + a Staff title). */
export const FLAGGED_LETTER =
  "I have 5 years experience as a Staff Engineer leading large teams. " +
  "I contributed KubeArmor eBPF security policies.";

/** Layer-2 semantic auditor verdict: affirmatively found no unsupported claims. */
export const SEMANTIC_OK = JSON.stringify({ unsupported_claims: [] });

// ============================================================
// Mock Gemini clients
// ============================================================

export function jsonLetterClient(letter: string): GeminiClient {
  return {
    async generate() {
      return JSON.stringify({ letter });
    },
  };
}

export function countingClient(responder: (call: number) => string): {
  client: GeminiClient;
  state: { calls: number };
} {
  const state = { calls: 0 };
  const client: GeminiClient = {
    async generate() {
      state.calls += 1;
      return responder(state.calls);
    },
  };
  return { client, state };
}
