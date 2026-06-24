// classify.ts
// File: src/engines/normalization/classify.ts
// Purpose: Source-agnostic domain derivation and category inference.

import type { Category, Domain, RawItem } from "./types";
import { DOMAIN_KEYWORDS } from "./config";

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a word-boundary, case-insensitive matcher for a keyword. */
function keywordRegExp(keyword: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?:$|[^a-z0-9])`, "i");
}

// Pre-compile keyword regexes once (deterministic, order-stable).
const COMPILED: { domain: Domain; patterns: RegExp[] }[] = (
  Object.keys(DOMAIN_KEYWORDS) as Exclude<Domain, "Other">[]
).map((domain) => ({
  domain,
  patterns: DOMAIN_KEYWORDS[domain].map(keywordRegExp),
}));

/**
 * Derive controlled-vocab domains by keyword-matching `role + description_norm`.
 * Multi-assign; returns matched domains in vocabulary order. May be empty when
 * nothing matches (which lowers completeness, by design — "Other" is never
 * auto-assigned).
 */
export function deriveDomains(role: string, descriptionNorm: string): Domain[] {
  const haystack = `${role} ${descriptionNorm}`;
  const matched: Domain[] = [];
  for (const { domain, patterns } of COMPILED) {
    if (patterns.some((re) => re.test(haystack))) matched.push(domain);
  }
  return matched;
}

/**
 * Infer category when the adapter could not set it. Evaluated top-down, first
 * match wins (spec order): intern → Internship; contract/freelance/gig →
 * Freelance; LFX/GSoC/CNCF source → OSS; funding / "hiring our first" →
 * Startup; else Job.
 */
export function inferCategory(
  raw: RawItem,
  role: string,
  descriptionNorm: string
): Category {
  const text = `${role} ${descriptionNorm}`.toLowerCase();
  const sourceName = raw.source_name.toLowerCase();

  if (/\bintern(ship)?\b/.test(text)) return "Internship";
  if (/\b(contract|contractor|freelance|freelancer|gig)\b/.test(text)) {
    return "Freelance";
  }

  const ossSource =
    raw.source_type === "oss" || /\b(lfx|gsoc|cncf)\b/.test(sourceName);
  if (ossSource || /\b(lfx|gsoc|cncf)\b/.test(text)) return "OSS";

  if (/\bfunding\b|hiring\s+our\s+first|\bpre[\s-]?seed\b|\bseed\s+round\b|just\s+raised/.test(text)) {
    return "Startup";
  }

  return "Job";
}
