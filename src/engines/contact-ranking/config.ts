// config.ts
// File: src/engines/contact-ranking/config.ts
// Purpose: Static configuration for the Contact Discovery & Ranking Engine
//          (Engine 5): reachability constants, the domain-aware role_relevance
//          mapping, seniority derivation keywords, and the seniority_pref order.
//          All tunables live here, never inline in logic modules.

import type { Seniority } from "./types";

// ============================================================
// Reachability (spec Logic step 2 + GAP D)
//   1 base + 2 (any direct/email channel) + 1 (twitter|blog) + 1 (followers>100)
//   capped 5, THEN -1 if last_verified is stale (floor 1).
// ============================================================

export const REACHABILITY_BASE = 1;
export const REACHABILITY_DIRECT_CHANNEL = 2; // email OR active github OR active slack (single +2)
export const REACHABILITY_SOCIAL = 1; // twitter OR blog (single +1)
export const REACHABILITY_FOLLOWERS = 1; // followers strictly > FOLLOWERS_THRESHOLD
export const REACHABILITY_MAX = 5;
export const REACHABILITY_MIN = 1;

export const FOLLOWERS_THRESHOLD = 100;

/** last_verified older than this is "stale" → reachability -1 (floor 1). */
export const STALE_MONTHS = 6;
export const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

// ============================================================
// role_relevance (spec Logic step 3 + GAP C) — domain-aware, tunable.
//   5 core-domain · 4 adjacent · 3 generic engineer · 2 recruiter · 1 unrelated
//   fallback (unrecognized title) = 3
// ============================================================

export const ROLE_RELEVANCE = {
  CORE: 5,
  ADJACENT: 4,
  ENGINEER: 3,
  RECRUITER: 2,
  UNRELATED: 1,
  FALLBACK: 3,
} as const;

/** A title containing any of these is a maintainer → core (5) for any domain. */
export const MAINTAINER_KEYWORDS = ["maintainer"];

/** Per-domain core title keywords (score 5 when the opportunity has that domain). */
export const CORE_KEYWORDS_BY_DOMAIN: Record<string, string[]> = {
  "Cloud-Native": ["cloud native", "cloud-native"],
  Kubernetes: ["kubernetes", "k8s"],
  Security: ["security", "appsec", "infosec"],
  eBPF: ["ebpf", "bpf"],
  "Chaos-Engineering": ["chaos", "resilience"],
  Networking: ["network", "cni", "service mesh"],
  DevTools: ["developer tools", "devtools", "developer experience", "developer advocate"],
  Infra: ["infrastructure", "platform", "infra"],
  Observability: ["observability", "monitoring"],
  "Web/Frontend": ["frontend", "front-end", "front end", "ui engineer"],
  Backend: ["backend", "back-end", "back end"],
  Data: ["data engineer", "data engineering"],
  "AI/ML": ["machine learning", "ml engineer", "ai engineer"],
  Other: [],
};

/** Adjacent-to-cloud-native titles (score 4). */
export const ADJACENT_KEYWORDS = [
  "infrastructure",
  "platform",
  "devtools",
  "developer tools",
  "sre",
  "site reliability",
  "devops",
  "observability",
];

/** Generic engineering titles (score 3). */
export const ENGINEER_KEYWORDS = ["engineer", "developer", "swe", "software"];

/** Recruiter / talent titles (score 2, and seniority Recruiter). */
export const RECRUITER_KEYWORDS = ["recruiter", "talent", "sourcer", "sourcing"];

/** Clearly-unrelated titles (score 1). */
export const UNRELATED_KEYWORDS = [
  "marketing",
  "sales",
  "account executive",
  "finance",
  "accountant",
  "human resources",
];

// ============================================================
// Seniority (spec Logic step 4 + GAP F) — title-keyword → seniority.
// ============================================================

/** Seniority tiers in preference order (index = rank; lower is preferred). */
export const SENIORITY_ORDER: Seniority[] = [
  "Founder",
  "Eng Manager",
  "Staff/Principal",
  "Senior",
  "Mid",
  "Recruiter",
];

/** Ordered title-keyword → seniority rules; first match wins. */
export const SENIORITY_KEYWORDS: { seniority: Seniority; keywords: string[] }[] = [
  { seniority: "Founder", keywords: ["founder", "co-founder", "cofounder", "ceo", "cto", "chief"] },
  {
    seniority: "Eng Manager",
    keywords: ["engineering manager", "eng manager", "director of eng", "vp engineering", "head of engineering", "vp of engineering"],
  },
  { seniority: "Recruiter", keywords: RECRUITER_KEYWORDS },
  { seniority: "Staff/Principal", keywords: ["staff", "principal", "distinguished"] },
  { seniority: "Senior", keywords: ["senior", "sr.", "sr "] },
];

/** Seniority when no keyword matches. */
export const SENIORITY_DEFAULT: Seniority = "Mid";
