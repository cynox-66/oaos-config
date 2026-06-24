// tests/fixtures/job_board.ts
// Hand-labeled RawItem fixtures for the generic job_board adapter.
// Each carries an expected category and ≥1 expected domain for accuracy tests.

import type { LabeledFixture } from "./manual";

const at = "2026-06-21T09:00:00.000Z";

export const JOB_BOARD_FIXTURES: LabeledFixture[] = [
  {
    name: "wellfound senior eBPF engineer",
    raw: {
      source_type: "job_board",
      source_name: "wellfound",
      url: "https://wellfound.com/jobs/123-senior-ebpf-engineer",
      fetched_at: at,
      raw_payload: {
        company: "Isovalent",
        title: "Senior eBPF Engineer",
        description: "Own the cilium dataplane: ebpf and networking internals.",
        salary: "$160k - $200k / year",
      },
    },
    expected: { category: "Job", domains: ["eBPF", "Networking"] },
  },
  {
    name: "upwork kubernetes consultant (freelance source_type)",
    raw: {
      source_type: "freelance",
      source_name: "upwork",
      url: "https://upwork.com/jobs/456",
      fetched_at: at,
      raw_payload: {
        company: "Private Client",
        title: "Kubernetes Consultant",
        description: "Set up and harden a kubernetes (k8s) cluster.",
        rate: "$80 / hour",
      },
    },
    expected: { category: "Freelance", domains: ["Kubernetes"] },
  },
  {
    name: "lfx krkn chaos mentee (oss source_type)",
    raw: {
      source_type: "oss",
      source_name: "lfx",
      url: "https://mentorship.lfx.linuxfoundation.org/project/789",
      fetched_at: at,
      raw_payload: {
        company: "CNCF",
        title: "Krkn Chaos Engineering Mentee",
        description: "chaos engineering and kubernetes resilience testing on krkn.",
      },
    },
    expected: { category: "OSS", domains: ["Chaos-Engineering"] },
  },
  {
    name: "internjobs security intern (internship source_type)",
    raw: {
      source_type: "internship",
      source_name: "internshala",
      url: "https://internshala.com/internship/321",
      fetched_at: at,
      raw_payload: {
        company: "AccuKnox",
        title: "Security Engineering Intern",
        description: "kubearmor runtime security and ebpf enforcement.",
      },
    },
    expected: { category: "Internship", domains: ["Security", "eBPF"] },
  },
  {
    name: "startup signal founding backend (startup_signal source_type)",
    raw: {
      source_type: "startup_signal",
      source_name: "ycombinator",
      url: "https://ycombinator.com/companies/newco/jobs/1",
      fetched_at: at,
      raw_payload: {
        company: "NewCo",
        title: "Founding Backend Engineer",
        description: "Build the backend microservices and rest api.",
        compensation: "₹2,500,000 / year + equity",
      },
    },
    expected: { category: "Startup", domains: ["Backend"] },
  },
  {
    name: "job_board observability engineer",
    raw: {
      source_type: "job_board",
      source_name: "linkedin",
      url: "https://linkedin.com/jobs/view/999",
      fetched_at: at,
      raw_payload: {
        company: "Grafana Labs",
        title: "Observability Engineer",
        description: "prometheus, opentelemetry and metrics pipelines.",
        salary: "$140000 / year",
      },
    },
    expected: { category: "Job", domains: ["Observability"] },
  },
  {
    name: "job_board software intern (inference overrides source_type)",
    raw: {
      source_type: "job_board",
      source_name: "linkedin",
      url: "https://linkedin.com/jobs/view/1000",
      fetched_at: at,
      raw_payload: {
        company: "BigCorp",
        title: "Software Engineering Intern",
        description: "Assist the backend team with microservices.",
      },
    },
    expected: { category: "Internship", domains: ["Backend"] },
  },
  {
    name: "freelance frontend developer (freelance source_type)",
    raw: {
      source_type: "freelance",
      source_name: "upwork",
      url: "https://upwork.com/jobs/789",
      fetched_at: at,
      raw_payload: {
        company: "Design Agency",
        title: "Frontend Developer",
        description: "react and vue work on the web ui.",
        rate: "$50 / hr",
      },
    },
    expected: { category: "Freelance", domains: ["Web/Frontend"] },
  },
  {
    name: "job_board ML engineer",
    raw: {
      source_type: "job_board",
      source_name: "wellfound",
      url: "https://wellfound.com/jobs/ml-1",
      fetched_at: at,
      raw_payload: {
        company: "OpenML",
        title: "ML Engineer",
        description: "machine learning with tensorflow and llm fine-tuning.",
        salary: "$180k / year",
      },
    },
    expected: { category: "Job", domains: ["AI/ML"] },
  },
  {
    name: "job_board remote network engineer",
    raw: {
      source_type: "job_board",
      source_name: "linkedin",
      url: "https://linkedin.com/jobs/view/1234",
      fetched_at: at,
      raw_payload: {
        company: "Tigera",
        title: "Network Engineer",
        description: "cilium, cni and network policy.",
        workplace_type: "Remote",
        salary: "$150k - $190k per year",
      },
    },
    expected: { category: "Job", domains: ["Networking"] },
  },
  {
    name: "job_board developer experience engineer",
    raw: {
      source_type: "job_board",
      source_name: "wellfound",
      url: "https://wellfound.com/jobs/dx-1",
      fetched_at: at,
      raw_payload: {
        company: "Postman",
        title: "Developer Experience Engineer",
        description: "Build the sdk, cli tool and developer tools.",
        salary: "$120000 annually",
      },
    },
    expected: { category: "Job", domains: ["DevTools"] },
  },
  {
    name: "job_board data engineer",
    raw: {
      source_type: "job_board",
      source_name: "linkedin",
      url: "https://linkedin.com/jobs/view/5678",
      fetched_at: at,
      raw_payload: {
        company: "Databricks",
        title: "Data Engineer",
        description: "data pipeline work with spark, kafka and etl.",
        salary: "$170k / year",
      },
    },
    expected: { category: "Job", domains: ["Data"] },
  },
];
