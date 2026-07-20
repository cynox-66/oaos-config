// tests/fixtures.ts
// Hand-labeled (opportunity → expected-best-evidence) pairs over the real
// inventory in evidence/inventory.md, for top-1 accuracy validation.

import type { Opportunity } from "../../normalization/types";
import { makeOpportunity } from "./helpers";

export interface LabeledPair {
  name: string;
  opportunity: Opportunity;
  // A ranked #1 counts as a hit if it is any of these ids. For most pairs this
  // is a single id; for families with several honest sibling assets (krkn-*,
  // heka-*) any sibling is an acceptable top-1 (see below).
  acceptedEvidenceIds: string[];
}

// Family-level acceptance sets: within these families several real assets are
// legitimately the "best" match for the same opportunity, so any sibling
// ranking first counts as a hit (per operator decision).
const KRKN_FAMILY = ["krkn-rollback-systemexit", "krkn-lib-execcmd-args", "krkn-ci-sha-pinning"];
const HEKA_FAMILY = [
  "heka-bearerguard-fix",
  "heka-oid4vp-sdjwt-hardening",
  "heka-rfc-commit-identity-binding",
  "heka-oid4vp-replay-prevention",
];

// 6 labeled pairs. Pairs 1/7 (eBPF/KubeArmor precision) dropped — no strong
// merged eBPF/Kubernetes evidence exists yet; revisit if KubeArmor PRs get
// merged. KubeStellar/Antrea pairs also removed — no frontend-for-k8s or
// CNI/networking evidence exists; restore when that evidence exists.
export const LABELED_PAIRS: LabeledPair[] = [
  {
    name: "Chaos engineering on Kubernetes → Krkn",
    opportunity: makeOpportunity({
      domain: ["Chaos-Engineering", "Kubernetes"],
      role: "Chaos Engineer",
      description_norm: "chaos engineering and resilience testing on Kubernetes with Go",
    }),
    acceptedEvidenceIds: KRKN_FAMILY,
  },
  {
    name: "Security protocol/standards → OID4VP RFC",
    opportunity: makeOpportunity({
      domain: ["Security"],
      role: "Security Engineer - Protocol Design",
      description_norm: "standards-track protocol design and identity security",
    }),
    acceptedEvidenceIds: HEKA_FAMILY,
  },
  {
    name: "Full-stack TypeScript/React → devjaiswal.me",
    opportunity: makeOpportunity({
      domain: ["Web/Frontend", "Backend"],
      role: "Full-Stack Engineer",
      description_norm: "TypeScript, React, Node.js full stack",
    }),
    acceptedEvidenceIds: ["portfolio-devjaiswal"],
  },
  {
    name: "Cloud-native resilience in Go → Krkn",
    opportunity: makeOpportunity({
      domain: ["Chaos-Engineering", "Kubernetes"],
      role: "Platform Engineer",
      description_norm: "Kubernetes resilience and chaos engineering in Go",
    }),
    acceptedEvidenceIds: KRKN_FAMILY,
  },
  {
    name: "Identity standards → OID4VP RFC",
    opportunity: makeOpportunity({
      domain: ["Security"],
      role: "Identity & Standards Engineer",
      description_norm: "identity protocols and standards design",
    }),
    acceptedEvidenceIds: HEKA_FAMILY,
  },
  {
    name: "Freelance resilience consultant → Krkn",
    opportunity: makeOpportunity({
      domain: ["Chaos-Engineering"],
      category: "Freelance",
      role: "Freelance Resilience Consultant",
      description_norm: "chaos engineering and resilience testing for Kubernetes",
    }),
    acceptedEvidenceIds: KRKN_FAMILY,
  },
];
