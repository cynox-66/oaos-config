// tests/helpers.ts
// Builders and mock Gemini clients for the Outreach Package engine tests.

import type { Domain, Opportunity } from "../../normalization/types";
import type { Contact } from "../../contact-ranking/types";
import type { Evidence, EvidenceMatch } from "../../evidence-matching/types";
import type { GeminiClient } from "../../scoring/types";
import { wordCount } from "../constraints";
import type { Channel, OutreachDraft, OutreachRequest } from "../types";

export const KUBEARMOR_URL = "https://github.com/kubearmor/KubeArmor";

export const INVENTORY: Evidence[] = [
  {
    id: "kubearmor",
    title: "KubeArmor contributions",
    type: "PR",
    url: KUBEARMOR_URL,
    tech_tags: ["eBPF", "Security", "Kubernetes"],
    domains: ["eBPF", "Security"],
    relevance_blurb: "KubeArmor contributions proving eBPF runtime security capability.",
    recency_date: "2025-04-10",
    strength: 5,
  },
  {
    id: "portfolio",
    title: "devjaiswal.me",
    type: "Project",
    url: "https://devjaiswal.me",
    tech_tags: ["React", "TypeScript"],
    domains: ["Web/Frontend"],
    relevance_blurb: "Portfolio proving full-stack engineering.",
    recency_date: "2025-06-01",
    strength: 3,
  },
];

export function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    name: "Ada Maintainer",
    company: "Isovalent",
    title: "Security Engineer",
    seniority: "Senior",
    channels: { github: "ada", email: "ada@isovalent.com", linkedin: null, slack: null },
    reachability: 5,
    role_relevance: 5,
    oss_overlap: "KubeArmor maintainer",
    last_verified: "2026-05-01",
    primary: true,
    relationship: "Cold",
    identity_uncertain: false,
    ...over,
  };
}

export function makeOpportunity(domain: Domain[] = ["eBPF", "Security"]): Opportunity {
  return {
    id: "opp_1",
    company: "Isovalent",
    role: "eBPF Security Engineer",
    category: "Job",
    domain,
    source_name: "manual",
    source_type: "job_board",
    url: null,
    description_raw: "",
    description_norm: "ebpf security cilium",
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

export function makeMatch(rankedIds: string[]): EvidenceMatch {
  return {
    id: "match_1",
    ranked: rankedIds.map((id, i) => ({ evidence_id: id, fit_score: 0.9 - i * 0.1, reason: "proves eBPF security" })),
    top_score: rankedIds.length ? 0.9 : 0,
    coverage_gap: null,
  };
}

export function makeRequest(channel: Channel, over: Partial<OutreachRequest> = {}): OutreachRequest {
  return {
    contact: makeContact(),
    opportunity: makeOpportunity(),
    match: makeMatch(["kubearmor"]),
    inventory: INVENTORY,
    ask_type: "advice",
    channel,
    ...over,
  };
}

/** Build an OutreachDraft from a body/subject (computes counts). */
export function makeDraft(
  channel: Channel,
  body: string,
  subject: string | null = null
): OutreachDraft {
  return {
    channel,
    subject,
    body,
    word_count: wordCount(body),
    char_count: body.length,
    evidence_referenced: "kubearmor",
    constraint_pass: false,
    constraint_violations: [],
    customization_notes: "x",
  };
}

// A clean email that satisfies every constraint (technical opener, one URL).
export const CLEAN_EMAIL = {
  subject: "eBPF runtime security at Isovalent",
  body:
    "Your KubeArmor eBPF policy enforcement work stood out. I shipped runtime security policies and " +
    `Kubernetes network policy enforcement at AccuKnox. My contributions are at ${KUBEARMOR_URL} for reference. ` +
    "Could we discuss the eBPF security role at Isovalent?",
};

// A draft that trips the banned-phrase gate ("just following up").
export const BANNED_EMAIL = {
  subject: "eBPF role",
  body: `Just following up on your KubeArmor eBPF work. My contributions are at ${KUBEARMOR_URL}.`,
};

// ============================================================
// Mock Gemini clients
// ============================================================

export function jsonClient(obj: unknown): GeminiClient {
  return {
    async generate() {
      return JSON.stringify(obj);
    },
  };
}

export function countingClient(responder: (call: number) => unknown): {
  client: GeminiClient;
  state: { calls: number };
} {
  const state = { calls: 0 };
  const client: GeminiClient = {
    async generate() {
      state.calls += 1;
      return JSON.stringify(responder(state.calls));
    },
  };
  return { client, state };
}
