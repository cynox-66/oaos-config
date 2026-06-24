// tests/helpers.ts
// Builders for Engine 4 tests.

import type { Category, Opportunity } from "../../normalization/types";
import type { Contact, Score, Tier } from "../../scoring/types";
import type { ActionRequest, EvidenceMatch } from "../types";

/** Default total per tier (within each tier's band). */
const TIER_TOTAL: Record<Tier, number> = { S: 90, A: 75, B: 55, C: 30 };

export function makeScore(tier: Tier, over: Partial<Score> = {}): Score {
  return {
    quality: { domain: 0, oss: 0, leverage: 0, stage: 0, total: 0 },
    match: { overlap: 0, evidence: 0, contact: 0, network: 0, total: 0 },
    total: TIER_TOTAL[tier],
    tier,
    confidence: 0.8,
    rationale: "test",
    scored_at: "2026-06-24T00:00:00.000Z",
    inputs_hash: "hash",
    tier_uncertain: false,
    ...over,
  };
}

export function makeOpportunity(category: Category): Opportunity {
  return {
    id: "opp_test",
    company: "Acme",
    role: "Engineer",
    category,
    domain: [],
    source_name: "manual",
    source_type: "job_board",
    url: null,
    description_raw: "",
    description_norm: "",
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

export function reachableContacts(): Contact[] {
  return [{ id: "c", reachability: 5, relationship: "Warm" }];
}

export function unreachableContacts(): Contact[] {
  return [{ id: "c", reachability: 2, relationship: "Cold" }];
}

function evidenceWithGap(coverage_gap: string | null): EvidenceMatch {
  return { id: "e", ranked: [], top_score: 0, coverage_gap };
}

export interface RequestSpec {
  tier: Tier;
  category: Category;
  reachable: boolean;
  confidence?: number;
  tier_uncertain?: boolean;
  total?: number;
  coverage_gap?: string | null;
}

export function makeRequest(spec: RequestSpec): ActionRequest {
  const score = makeScore(spec.tier, {
    confidence: spec.confidence ?? 0.8,
    tier_uncertain: spec.tier_uncertain ?? false,
    ...(spec.total !== undefined ? { total: spec.total } : {}),
  });
  return {
    opportunity: makeOpportunity(spec.category),
    score,
    contacts: spec.reachable ? reachableContacts() : unreachableContacts(),
    evidence_match:
      spec.coverage_gap !== undefined ? evidenceWithGap(spec.coverage_gap) : null,
  };
}
