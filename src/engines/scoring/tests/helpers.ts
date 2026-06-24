// tests/helpers.ts
// Shared test builders and mock Gemini clients for the scoring engine tests.

import type { Opportunity } from "../../normalization/types";
import type { GeminiClient, LLMScoreFactors, ScoreRequest } from "../types";

export const FIXED_NOW = "2026-06-24T00:00:00.000Z";

/** A fully-populated Opportunity with sensible defaults; override per test. */
export function makeOpportunity(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp_test",
    company: "Acme",
    role: "Platform Engineer",
    category: "Job",
    domain: ["Kubernetes"],
    source_name: "manual",
    source_type: "job_board",
    url: "https://acme.com/jobs/1",
    description_raw: "",
    description_norm: "kubernetes platform role",
    comp_min: 500000,
    comp_max: 700000,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp_test",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
    ...over,
  };
}

/** Build a ScoreRequest with defaults (no research, no contacts, no evidence). */
export function makeRequest(over: Partial<ScoreRequest> = {}): ScoreRequest {
  return {
    opportunity: makeOpportunity(over.opportunity),
    research: over.research ?? null,
    contacts: over.contacts ?? [],
    evidence_match: over.evidence_match ?? null,
  };
}

/** A Gemini client that always returns the given factors as JSON. */
export function jsonClient(factors: Partial<LLMScoreFactors>): GeminiClient {
  const body: LLMScoreFactors = {
    quality_domain: 0,
    quality_leverage: 0,
    match_overlap: 0,
    rationale: "test",
    ...factors,
  };
  return {
    async generate() {
      return JSON.stringify(body);
    },
  };
}

/** A client whose response is chosen per call number; tracks call count. */
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
