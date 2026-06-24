// tests/fixtures.ts
// Hand-labeled (opportunity → expected-best-evidence) pairs over the real
// inventory in evidence/inventory.md, for top-1 accuracy validation.

import type { Opportunity } from "../../normalization/types";
import { makeOpportunity } from "./helpers";

export interface LabeledPair {
  name: string;
  opportunity: Opportunity;
  expectedEvidenceId: string;
}

export const LABELED_PAIRS: LabeledPair[] = [
  {
    name: "eBPF runtime security role → KubeArmor",
    opportunity: makeOpportunity({
      domain: ["eBPF", "Security"],
      role: "eBPF Security Engineer",
      description_norm: "runtime security with eBPF on Linux and Kubernetes",
    }),
    expectedEvidenceId: "kubearmor",
  },
  {
    name: "Chaos engineering on Kubernetes → Krkn",
    opportunity: makeOpportunity({
      domain: ["Chaos-Engineering", "Kubernetes"],
      role: "Chaos Engineer",
      description_norm: "chaos engineering and resilience testing on Kubernetes with Go",
    }),
    expectedEvidenceId: "krkn-chaos",
  },
  {
    name: "Frontend for a CNCF Kubernetes project → KubeStellar UI PR",
    opportunity: makeOpportunity({
      domain: ["Web/Frontend", "Kubernetes"],
      role: "Frontend Engineer",
      description_norm: "React and TypeScript UI for a CNCF Kubernetes project",
    }),
    expectedEvidenceId: "kubestellar-ui-pr",
  },
  {
    name: "Kubernetes CNI networking → Antrea",
    opportunity: makeOpportunity({
      domain: ["Networking", "Kubernetes"],
      role: "Network Engineer",
      description_norm: "Kubernetes CNI and networking with Go",
    }),
    expectedEvidenceId: "antrea",
  },
  {
    name: "Security protocol/standards → OID4VP RFC",
    opportunity: makeOpportunity({
      domain: ["Security"],
      role: "Security Engineer - Protocol Design",
      description_norm: "standards-track protocol design and identity security",
    }),
    expectedEvidenceId: "oid4vp-rfc",
  },
  {
    name: "Full-stack TypeScript/React → devjaiswal.me",
    opportunity: makeOpportunity({
      domain: ["Web/Frontend", "Backend"],
      role: "Full-Stack Engineer",
      description_norm: "TypeScript, React, Node.js full stack",
    }),
    expectedEvidenceId: "devjaiswal-me",
  },
  {
    name: "Linux runtime security → KubeArmor",
    opportunity: makeOpportunity({
      domain: ["Security"],
      role: "Linux Runtime Security Engineer",
      description_norm: "runtime security and eBPF on Linux",
    }),
    expectedEvidenceId: "kubearmor",
  },
  {
    name: "Cloud-native resilience in Go → Krkn",
    opportunity: makeOpportunity({
      domain: ["Cloud-Native", "Kubernetes"],
      role: "Platform Engineer",
      description_norm: "Kubernetes resilience and chaos engineering in Go",
    }),
    expectedEvidenceId: "krkn-chaos",
  },
  {
    name: "CNCF dashboards frontend → KubeStellar UI PR",
    opportunity: makeOpportunity({
      domain: ["Web/Frontend"],
      role: "UI Engineer",
      description_norm: "React TypeScript frontend for CNCF Kubernetes dashboards",
    }),
    expectedEvidenceId: "kubestellar-ui-pr",
  },
  {
    name: "Identity standards → OID4VP RFC",
    opportunity: makeOpportunity({
      domain: ["Security"],
      role: "Identity & Standards Engineer",
      description_norm: "identity protocols and standards design",
    }),
    expectedEvidenceId: "oid4vp-rfc",
  },
  {
    name: "Freelance resilience consultant → Krkn",
    opportunity: makeOpportunity({
      domain: ["Chaos-Engineering"],
      category: "Freelance",
      role: "Freelance Resilience Consultant",
      description_norm: "chaos engineering and resilience testing for Kubernetes",
    }),
    expectedEvidenceId: "krkn-chaos",
  },
];
