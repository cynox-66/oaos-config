// tests/calibration.ts
// Hand-labeled calibration fixtures: a ScoreRequest, the mocked LLM factors,
// and the expected tier. Totals are constructed deterministically so each
// computed tier is reproducible (the LLM is mocked to return `llm`).

import type { LLMScoreFactors, ScoreRequest, Tier } from "../types";
import { makeOpportunity } from "./helpers";

export interface CalibrationFixture {
  name: string;
  request: ScoreRequest;
  llm: LLMScoreFactors;
  expectedTier: Tier;
}

const llm = (
  quality_domain: number,
  quality_leverage: number,
  match_overlap: number
): LLMScoreFactors => ({ quality_domain, quality_leverage, match_overlap, rationale: "fixture" });

export const CALIBRATION_FIXTURES: CalibrationFixture[] = [
  {
    name: "Isovalent eBPF maintainer (S)",
    request: {
      opportunity: makeOpportunity({ company: "Isovalent", role: "eBPF Engineer", domain: ["eBPF"] }),
      research: { stage: "seed", oss_involvement: "maintains" },
      contacts: [{ id: "c1", reachability: 5, relationship: "GitHub Interaction" }],
      evidence_match: { id: "e1", top_score: 0.9 },
    },
    llm: llm(15, 14, 18), // q=49 m=44 → 93
    expectedTier: "S",
  },
  {
    name: "Strong OSS security maintainer (S)",
    request: {
      opportunity: makeOpportunity({ category: "OSS", comp_basis: "unpaid", domain: ["Security", "eBPF"] }),
      research: { stage: "seed", oss_involvement: "maintains" },
      contacts: [{ id: "c1", reachability: 5, relationship: "Met" }],
      evidence_match: { id: "e1", top_score: 1.0 },
    },
    llm: llm(15, 15, 20), // q=50 m=50 → 100 (OSS unpaid: leverage NOT capped)
    expectedTier: "S",
  },
  {
    name: "Teleport infra security (A)",
    request: {
      opportunity: makeOpportunity({ company: "Teleport", domain: ["Infra", "Security"] }),
      research: { stage: "series-b", oss_involvement: "contributes" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Warm" }],
      evidence_match: { id: "e1", top_score: 0.7 },
    },
    llm: llm(12, 11, 14), // q=36 m=37 → 73
    expectedTier: "A",
  },
  {
    name: "Wiz cloud security (A)",
    request: {
      opportunity: makeOpportunity({ company: "Wiz", domain: ["Security"] }),
      research: { stage: "series-a", oss_involvement: "contributes" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Slack" }],
      evidence_match: { id: "e1", top_score: 0.6 },
    },
    llm: llm(10, 12, 15), // q=36 m=34 → 70
    expectedTier: "A",
  },
  {
    name: "OSS LFX mentorship, unpaid not capped (A)",
    request: {
      opportunity: makeOpportunity({ category: "OSS", comp_basis: "unpaid", domain: ["Chaos-Engineering"] }),
      research: { stage: "unknown", oss_involvement: "maintains" },
      contacts: [{ id: "c1", reachability: 5, relationship: "GitHub Interaction" }],
      evidence_match: { id: "e1", top_score: 0.8 },
    },
    llm: llm(14, 15, 16), // q=42 m=41 → 83
    expectedTier: "A",
  },
  {
    name: "Equity startup, leverage capped at 8 (A)",
    request: {
      opportunity: makeOpportunity({ category: "Startup", comp_basis: "equity", domain: ["Backend"] }),
      research: { stage: "seed", oss_involvement: "uses" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Warm" }],
      evidence_match: { id: "e1", top_score: 0.6 },
    },
    llm: llm(12, 15, 14), // leverage 15→8; q=35 m=36 → 71
    expectedTier: "A",
  },
  {
    name: "Growth startup devtools (B)",
    request: {
      opportunity: makeOpportunity({ category: "Startup", domain: ["DevTools"] }),
      research: { stage: "growth", oss_involvement: "uses" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Cold" }],
      evidence_match: { id: "e1", top_score: 0.6 },
    },
    llm: llm(9, 9, 13), // q=26 m=27 → 53
    expectedTier: "B",
  },
  {
    name: "Corporate internship (B)",
    request: {
      opportunity: makeOpportunity({ category: "Internship", domain: ["Backend"] }),
      research: { stage: "public", oss_involvement: "contributes" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Cold" }],
      evidence_match: { id: "e1", top_score: 0.7 },
    },
    llm: llm(9, 5, 13), // q=22 m=28 → 50
    expectedTier: "B",
  },
  {
    name: "Mid freelance project (B)",
    request: {
      opportunity: makeOpportunity({ category: "Freelance", comp_basis: "project", domain: ["Web/Frontend"] }),
      research: { stage: "growth", oss_involvement: "uses" },
      contacts: [{ id: "c1", reachability: 4, relationship: "Slack" }],
      evidence_match: { id: "e1", top_score: 0.6 },
    },
    llm: llm(9, 8, 11), // q=25 m=30 → 55
    expectedTier: "B",
  },
  {
    name: "Generic React SaaS (C)",
    request: {
      opportunity: makeOpportunity({ company: "GenericSaaS", domain: ["Web/Frontend"] }),
      research: { stage: "seed", oss_involvement: "none" },
      contacts: [{ id: "c1", reachability: 3, relationship: "Cold" }],
      evidence_match: { id: "e1", top_score: 0.3 },
    },
    llm: llm(3, 6, 2), // q=19 m=10 → 29
    expectedTier: "C",
  },
  {
    name: "Late-stage public corp, generic (C)",
    request: {
      opportunity: makeOpportunity({ company: "MegaCorp", domain: [] }),
      research: { stage: "public", oss_involvement: "none" },
      contacts: [{ id: "c1", reachability: 2, relationship: "Cold" }],
      evidence_match: { id: "e1", top_score: 0.2 },
    },
    llm: llm(4, 2, 3), // q=7 m=8 → 15
    expectedTier: "C",
  },
  {
    name: "Unpaid non-OSS, leverage capped at 5 (C)",
    request: {
      opportunity: makeOpportunity({ category: "Job", comp_basis: "unpaid", domain: [] }),
      research: null,
      contacts: [],
      evidence_match: null,
    },
    llm: llm(2, 10, 1), // leverage 10→5; rule: oss0 stage3 contact0 ev0 net0; q=10 m=1 → 11
    expectedTier: "C",
  },
];
