// tests/schema.ts
// Runtime validator for the Opportunity schema. Returns a list of human-readable
// errors (empty = valid). Used to assert 100% of normalize outputs conform.

import type { Opportunity } from "../types";

const SOURCE_TYPES = [
  "job_board",
  "internship",
  "freelance",
  "startup_signal",
  "network",
  "oss",
];
const CATEGORIES = ["Job", "Internship", "Freelance", "Startup", "OSS", "Other"];
const COMP_BASES = ["monthly", "hourly", "project", "equity", "unpaid", "unknown"];
const REMOTES = ["remote", "hybrid", "onsite", "unknown"];
const DOMAINS = [
  "Cloud-Native",
  "Kubernetes",
  "Security",
  "eBPF",
  "Chaos-Engineering",
  "Networking",
  "DevTools",
  "Infra",
  "Observability",
  "Web/Frontend",
  "Backend",
  "Data",
  "AI/ML",
  "Other",
];

export function validateOpportunity(opp: Opportunity): string[] {
  const errors: string[] = [];
  const isStr = (v: unknown) => typeof v === "string";
  const nonEmpty = (v: unknown) => isStr(v) && (v as string).length > 0;

  // Required non-null strings.
  if (!nonEmpty(opp.id)) errors.push("id must be a non-empty string");
  if (!isStr(opp.company)) errors.push("company must be a string");
  if (!isStr(opp.role)) errors.push("role must be a string");
  if (!isStr(opp.source_name)) errors.push("source_name must be a string");
  if (!isStr(opp.description_raw)) errors.push("description_raw must be a string");
  if (!isStr(opp.description_norm)) errors.push("description_norm must be a string");
  if (!nonEmpty(opp.fingerprint)) errors.push("fingerprint must be a non-empty string");

  // Enums.
  if (!CATEGORIES.includes(opp.category)) errors.push(`bad category: ${opp.category}`);
  if (!SOURCE_TYPES.includes(opp.source_type)) errors.push(`bad source_type: ${opp.source_type}`);
  if (!COMP_BASES.includes(opp.comp_basis)) errors.push(`bad comp_basis: ${opp.comp_basis}`);
  if (!REMOTES.includes(opp.remote)) errors.push(`bad remote: ${opp.remote}`);
  if (opp.status !== "Discovered") errors.push(`status must be "Discovered": ${opp.status}`);

  // domain[]: array of controlled-vocab values.
  if (!Array.isArray(opp.domain)) {
    errors.push("domain must be an array");
  } else {
    for (const d of opp.domain) {
      if (!DOMAINS.includes(d)) errors.push(`bad domain value: ${d}`);
    }
  }

  // Allowed nullables.
  if (opp.url !== null && !isStr(opp.url)) errors.push("url must be string|null");
  if (opp.location !== null && !isStr(opp.location)) errors.push("location must be string|null");
  if (opp.comp_min !== null && typeof opp.comp_min !== "number") errors.push("comp_min must be number|null");
  if (opp.comp_max !== null && typeof opp.comp_max !== "number") errors.push("comp_max must be number|null");

  // description_raw length cap.
  if (isStr(opp.description_raw) && opp.description_raw.length > 5000) {
    errors.push("description_raw exceeds 5000 chars");
  }

  // Numbers / bools / arrays.
  if (typeof opp.completeness !== "number" || opp.completeness < 0 || opp.completeness > 1) {
    errors.push(`completeness out of range: ${opp.completeness}`);
  }
  if (typeof opp.needs_enrichment !== "boolean") errors.push("needs_enrichment must be boolean");
  if (!Array.isArray(opp.also_seen_in)) errors.push("also_seen_in must be an array");

  // date_found: ISO date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opp.date_found)) errors.push(`bad date_found: ${opp.date_found}`);

  return errors;
}
