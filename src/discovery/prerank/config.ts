// config.ts
// File: src/discovery/prerank/config.ts
// Purpose: Static configuration and default data for the Prerank Gate.
//          Pure exported data only — nothing here is read implicitly by
//          prerank(); callers import and pass what they want.

import type { PrerankConfig, PrerankVocabulary } from "./types";

/** Minimum cleaned text length for an item to be scoreable at all. */
export const MIN_TEXT_CHARS = 40;

/** Depth cap when harvesting string fields out of an unknown raw_payload shape. */
export const MAX_PAYLOAD_DEPTH = 6;

export const DEFAULT_PRERANK_CONFIG: PrerankConfig = {
  /** maxPerRun x ~4 Gemini calls/item = worst-case pipeline spend per run. */
  maxPerRun: 25,
  relevanceFloor: 0.05,
  remoteOnly: true,
};

/**
 * Onsite-indicating patterns. "hybrid" counts as onsite-indicating under the
 * locked remote-only scope.
 */
export const ONSITE_PATTERNS: string[] = [
  "onsite",
  "on-site",
  "on site",
  "in-office",
  "in office",
  "in the office",
  "hybrid",
  "must relocate",
  "relocation required",
];

/** Remote-indicating patterns. Any match suppresses the location gate. */
export const REMOTE_PATTERNS: string[] = [
  "remote",
  "fully remote",
  "remote-first",
  "work from home",
  "wfh",
  "distributed team",
  "work from anywhere",
];

/**
 * Starting vocabulary derived from Engine 1's controlled domain vocabulary
 * plus common surface variants. Callers must pass this explicitly:
 *
 *   prerank({ items, vocabulary: DEFAULT_VOCABULARY })
 *
 * Wave 1 replaces the argument with preferences.json-derived data; the call
 * site changes, this module does not.
 */
export const DEFAULT_VOCABULARY: PrerankVocabulary = {
  domainTerms: [
    // Cloud-Native
    "cloud-native",
    "cloud native",
    "containers",
    "docker",
    "helm",
    "service mesh",
    "istio",
    // Kubernetes
    "kubernetes",
    "k8s",
    "kubectl",
    "operator",
    "cncf",
    // Security
    "security",
    "appsec",
    "infosec",
    "threat",
    "vulnerability",
    "zero trust",
    "cryptography",
    // eBPF
    "ebpf",
    "bpf",
    "cilium",
    "falco",
    // Chaos-Engineering
    "chaos engineering",
    "chaos-engineering",
    "fault injection",
    "resilience",
    "litmus",
    // Networking
    "networking",
    "tcp",
    "dns",
    "load balancer",
    "cni",
    "proxy",
    // DevTools
    "devtools",
    "developer tools",
    "developer experience",
    "cli",
    "sdk",
    "tooling",
    // Infra
    "infrastructure",
    "infra",
    "platform engineering",
    "devops",
    "sre",
    "site reliability",
    "terraform",
    "ci/cd",
    "cicd",
    "aws",
    "gcp",
    "azure",
    // Observability
    "observability",
    "monitoring",
    "prometheus",
    "grafana",
    "opentelemetry",
    "tracing",
    "telemetry",
    // Web/Frontend
    "frontend",
    "front-end",
    "react",
    "typescript",
    "javascript",
    // Backend
    "backend",
    "back-end",
    "api",
    "microservices",
    "distributed systems",
    "golang",
    "rust",
    "python",
    // Data
    "data engineering",
    "etl",
    "sql",
    "postgres",
    "kafka",
    // AI/ML
    "machine learning",
    "ml",
    "llm",
    "ai",
    "inference",
  ],
  roleTerms: [
    "engineer",
    "engineering",
    "developer",
    "sre",
    "devops",
    "intern",
    "internship",
    "platform",
    "infrastructure",
    "security",
    "backend",
    "systems",
    "software",
    "architect",
    "contributor",
    "maintainer",
    "freelance",
    "contract",
  ],
  negativeTerms: [],
};
