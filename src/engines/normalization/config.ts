// config.ts
// File: src/engines/normalization/config.ts
// Purpose: Static configuration for the Opportunity Normalization Engine —
//          FX rate, hours-per-month, description boilerplate blocklist, the
//          controlled domain vocabulary, and company-suffix strip list.
//          All tunables live here, never inline in logic modules.

import type { Domain } from "./types";

// ============================================================
// Compensation normalization
// ============================================================

// Static fallback rate. Update manually when materially off.
// Last set: June 2026. Do not auto-refresh.
export const USD_TO_INR = 84;

/** Hours per month used to convert an hourly rate to a monthly figure. */
export const HOURS_PER_MONTH = 160;

// ============================================================
// Description cleaning — boilerplate blocklist
// ============================================================

/**
 * Regexes whose matches are stripped from a description during cleaning.
 * Kept deliberately conservative: only well-known, content-free boilerplate
 * (company-about headings, EEO statements, cookie notices).
 */
export const BOILERPLATE_BLOCKLIST: RegExp[] = [
  // Equal-opportunity / EEO statements.
  /\b(?:we are|is)\s+an\s+equal[\s-]opportunity\s+employer[^.]*\.?/gi,
  /\bequal[\s-]opportunity\s+employer[^.]*\.?/gi,
  // "About us" / "About the company" section headings.
  /\babout\s+(?:us|the\s+company|the\s+team|our\s+company)\b[:\s-]*/gi,
  // Cookie / tracking notices.
  /\bthis\s+(?:site|website)\s+uses\s+cookies[^.]*\.?/gi,
  /\bby\s+continuing\s+to\s+(?:use|browse|visit)[^.]*\.?/gi,
  /\bwe\s+use\s+cookies[^.]*\.?/gi,
];

// ============================================================
// Domain controlled vocabulary
// ============================================================

/**
 * Keyword sets per controlled-vocab domain. Matched case-insensitively with
 * word boundaries over `role + description_norm`. Multi-assign: an item may
 * match several domains. "Other" has no keywords — it is never auto-assigned,
 * so an item with no recognizable domain yields an empty `domain[]` (which in
 * turn lowers completeness and can flag needs_enrichment, per spec intent).
 */
export const DOMAIN_KEYWORDS: Record<Exclude<Domain, "Other">, string[]> = {
  "Cloud-Native": ["cloud native", "cloud-native", "cncf"],
  Kubernetes: ["kubernetes", "k8s"],
  Security: [
    "security",
    "appsec",
    "infosec",
    "vulnerability",
    "threat",
    "zero trust",
    "runtime security",
  ],
  eBPF: ["ebpf", "bpf"],
  "Chaos-Engineering": [
    "chaos engineering",
    "chaos eng",
    "fault injection",
    "resilience testing",
    "litmus",
    "krkn",
  ],
  Networking: [
    "networking",
    "cni",
    "network policy",
    "service mesh",
    "istio",
    "cilium",
    "load balancing",
  ],
  DevTools: [
    "developer tools",
    "devtools",
    "developer experience",
    "sdk",
    "cli tool",
    "developer platform",
  ],
  Infra: [
    "infrastructure",
    "platform engineering",
    "terraform",
    "devops",
    "sre",
    "site reliability",
    "iac",
  ],
  Observability: [
    "observability",
    "prometheus",
    "grafana",
    "opentelemetry",
    "tracing",
    "metrics",
    "logging",
  ],
  "Web/Frontend": [
    "frontend",
    "front-end",
    "front end",
    "react",
    "vue",
    "angular",
    "web ui",
    "ui engineer",
  ],
  Backend: [
    "backend",
    "back-end",
    "back end",
    "microservices",
    "rest api",
    "server-side",
    "golang",
    "node.js",
  ],
  Data: [
    "data engineering",
    "data pipeline",
    "etl",
    "data warehouse",
    "spark",
    "kafka",
    "analytics",
  ],
  "AI/ML": [
    "machine learning",
    "deep learning",
    "neural network",
    "llm",
    "artificial intelligence",
    "pytorch",
    "tensorflow",
    "nlp",
    "ai",
    "ml",
  ],
};

// ============================================================
// Fingerprint — company name normalization
// ============================================================

/**
 * Legal-entity suffixes stripped from a company name before fingerprinting,
 * so "Acme, Inc." and "Acme Ltd" collapse to the same key.
 */
export const COMPANY_SUFFIXES: string[] = [
  "inc",
  "llc",
  "ltd",
  "limited",
  "gmbh",
  "corp",
  "corporation",
  "co",
  "company",
  "pvt",
  "private",
  "plc",
  "llp",
  "sa",
  "srl",
  "bv",
  "ag",
];
