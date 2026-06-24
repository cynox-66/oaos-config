// tests/fixtures/manual.ts
// Hand-labeled RawItem fixtures for the manual (paste/free-text) adapter.
// Each carries an expected category and ≥1 expected domain for accuracy tests.

import type { Category, Domain, RawItem } from "../../types";

export interface LabeledFixture {
  name: string;
  raw: RawItem;
  expected: { category: Category; domains: Domain[] };
}

const at = "2026-06-20T10:00:00.000Z";

export const MANUAL_FIXTURES: LabeledFixture[] = [
  {
    name: "Isovalent eBPF engineer (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://isovalent.com/careers/ebpf-engineer",
      fetched_at: at,
      raw_payload: {
        company: "Isovalent, Inc.",
        role: "Software Engineer - eBPF / Cilium",
        description:
          "Work on the Cilium dataplane: eBPF networking, network policy, and service mesh at scale.",
        comp: "$160k - $220k / year",
        location: "Remote",
      },
    },
    expected: { category: "Job", domains: ["eBPF", "Networking"] },
  },
  {
    name: "AccuKnox security internship (text)",
    raw: {
      source_type: "internship",
      source_name: "manual",
      url: null,
      fetched_at: at,
      raw_payload:
        "Company: AccuKnox\nRole: Security Engineering Intern\nWork on KubeArmor runtime security and eBPF policy enforcement.",
    },
    expected: { category: "Internship", domains: ["Security", "eBPF"] },
  },
  {
    name: "Freelance Kubernetes consultant (text)",
    raw: {
      source_type: "freelance",
      source_name: "manual",
      url: null,
      fetched_at: at,
      raw_payload:
        "Role: Freelance Kubernetes Consultant\nCompany: Self-employed\nHelp clients harden their kubernetes (k8s) clusters.",
    },
    expected: { category: "Freelance", domains: ["Kubernetes"] },
  },
  {
    name: "LFX chaos engineering mentee (object)",
    raw: {
      source_type: "oss",
      source_name: "manual",
      url: "https://mentorship.lfx.linuxfoundation.org/project/krkn",
      fetched_at: at,
      raw_payload: {
        company: "CNCF",
        role: "LFX Mentee - Krkn Chaos Engineering",
        description:
          "Contribute to krkn chaos engineering and Kubernetes resilience testing.",
      },
    },
    expected: { category: "OSS", domains: ["Chaos-Engineering"] },
  },
  {
    name: "Seed startup founding engineer (text)",
    raw: {
      source_type: "network",
      source_name: "manual",
      url: null,
      fetched_at: at,
      raw_payload:
        "Company: AcmeData\nRole: Founding Engineer\nWe just raised our seed round and are hiring our first engineers to build our data pipeline and ETL stack.",
    },
    expected: { category: "Startup", domains: ["Data"] },
  },
  {
    name: "Grafana observability backend (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://grafana.com/jobs/backend-observability",
      fetched_at: at,
      raw_payload: {
        company: "Grafana Labs",
        role: "Backend Engineer - Observability",
        description:
          "Build microservices for prometheus, grafana, and opentelemetry tracing and metrics.",
      },
    },
    expected: { category: "Job", domains: ["Observability", "Backend"] },
  },
  {
    name: "Vercel frontend engineer (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://vercel.com/careers/frontend",
      fetched_at: at,
      raw_payload: {
        company: "Vercel",
        role: "Frontend Engineer",
        description: "Build the web UI in react and typescript.",
      },
    },
    expected: { category: "Job", domains: ["Web/Frontend"] },
  },
  {
    name: "HuggingFace ML engineer (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://huggingface.co/jobs/ml-engineer",
      fetched_at: at,
      raw_payload: {
        company: "Hugging Face",
        role: "Machine Learning Engineer",
        description: "Train llm models with pytorch; deep learning and nlp work.",
      },
    },
    expected: { category: "Job", domains: ["AI/ML"] },
  },
  {
    name: "Postman devtools internship (text)",
    raw: {
      source_type: "internship",
      source_name: "manual",
      url: null,
      fetched_at: at,
      raw_payload:
        "Role: Developer Tools Intern\nCompany: Postman\nBuild an SDK and CLI tool to improve developer experience.",
    },
    expected: { category: "Internship", domains: ["DevTools"] },
  },
  {
    name: "Independent freelance security engineer (text)",
    raw: {
      source_type: "freelance",
      source_name: "manual",
      url: null,
      fetched_at: at,
      raw_payload:
        "Role: Freelance Security Engineer\nCompany: Independent\nappsec reviews, vulnerability assessment, and zero trust design.",
    },
    expected: { category: "Freelance", domains: ["Security"] },
  },
  {
    name: "HashiCorp platform engineer (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://hashicorp.com/careers/platform",
      fetched_at: at,
      raw_payload: {
        company: "HashiCorp",
        role: "Platform Engineer",
        description: "terraform, infrastructure as code, devops and sre practices.",
      },
    },
    expected: { category: "Job", domains: ["Infra"] },
  },
  {
    name: "Tigera networking engineer (object)",
    raw: {
      source_type: "job_board",
      source_name: "manual",
      url: "https://tigera.io/careers/network-engineer",
      fetched_at: at,
      raw_payload: {
        company: "Tigera",
        role: "Network Engineer",
        description: "kubernetes cni, network policy and service mesh.",
      },
    },
    expected: { category: "Job", domains: ["Networking", "Kubernetes"] },
  },
];
