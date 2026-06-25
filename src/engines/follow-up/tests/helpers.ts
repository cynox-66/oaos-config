// tests/helpers.ts
// Builders and mock Gemini clients for the Follow-Up engine tests.

import type { Category, Opportunity } from "../../normalization/types";
import type { Contact } from "../../contact-ranking/types";
import type { Evidence } from "../../evidence-matching/types";
import type { GeminiClient } from "../../scoring/types";
import type { Channel, OutreachDraft } from "../../outreach-package/types";
import type { FollowUpRequest, OutreachStatus } from "../types";

export const SENT_DATE = new Date("2026-06-01T00:00:00.000Z");
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    name: "Ada Maintainer",
    company: "Isovalent",
    title: "Security Engineer",
    seniority: "Senior",
    channels: { github: "ada", email: "ada@isovalent.com", linkedin: "ada", slack: null },
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

export function makeOpportunity(category: Category = "Job"): Opportunity {
  return {
    id: "opp_1",
    company: "Isovalent",
    role: "eBPF Security Engineer",
    category,
    domain: ["eBPF", "Security"],
    source_name: "manual",
    source_type: "job_board",
    url: null,
    description_raw: "",
    description_norm: "ebpf security",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-05-20",
    fingerprint: "fp_test",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
  };
}

export function makeOriginalDraft(channel: Channel = "email"): OutreachDraft {
  return {
    channel,
    subject: "eBPF security at Isovalent",
    body: "Your KubeArmor eBPF work stood out. Could we discuss the role?",
    word_count: 11,
    char_count: 60,
    evidence_referenced: "kubearmor",
    constraint_pass: true,
    constraint_violations: [],
    customization_notes: "verify",
  };
}

export const NEW_EVIDENCE: Evidence = {
  id: "krkn-chaos",
  title: "Krkn Chaos contributions",
  type: "PR",
  url: "https://github.com/krkn-chaos/krkn",
  tech_tags: ["Chaos-Engineering", "Kubernetes"],
  domains: ["Chaos-Engineering"],
  relevance_blurb: "Recent chaos engineering contributions.",
  recency_date: "2025-05-01",
  strength: 5,
};

export function makeRequest(over: Partial<FollowUpRequest> = {}): FollowUpRequest {
  return {
    outreach_id: "o1",
    sent_date: SENT_DATE,
    channel: "email",
    status: "Sent" as OutreachStatus,
    step: 0,
    original_draft: makeOriginalDraft(),
    opportunity: makeOpportunity(),
    contact: makeContact(),
    new_evidence: null,
    recent_activity: null,
    ...over,
  };
}

// ============================================================
// Clean per-step bodies (pass all constraints)
// ============================================================

export const CLEAN_FU1 =
  "Your KubeArmor eBPF policy path shipped cleanly. I published a runtime-security write-up that builds on it; thought it might be useful to you.";
export const CLEAN_FU2 =
  "Saw your recent Cilium dataplane talk. Curious how you handle policy churn at scale — would a short comparison of approaches be useful?";
export const CLEAN_FU3 =
  "Closing the loop gracefully. The eBPF security work stands on its own; if timing improves later, the door stays open. Wishing you well.";

// ============================================================
// Mock Gemini clients
// ============================================================

export function jsonClient(body: string): GeminiClient {
  return {
    async generate() {
      return JSON.stringify({ body });
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
      return JSON.stringify({ body: responder(state.calls) });
    },
  };
  return { client, state };
}
