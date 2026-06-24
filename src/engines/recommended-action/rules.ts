// rules.ts
// File: src/engines/recommended-action/rules.ts
// Purpose: The decision table as an ordered array of Rule objects (Section 4),
//          evaluated top-down, first match wins. The final rule is a catch-all
//          → Ignore, guaranteeing totality. Predicates are defensive so a
//          malformed request falls through to the catch-all rather than throwing.

import type { ActionRequest, ResolvedOptions, Rule } from "./types";
import { PIPELINE_THIN_TOP_OF_C_MIN, REACHABILITY_MIN } from "./config";

// ============================================================
// Predicate helpers (pure, defensive)
// ============================================================

/** "contact reachable" = some Contact has reachability ≥ REACHABILITY_MIN. */
export function isReachable(request: ActionRequest): boolean {
  const contacts = request.contacts ?? [];
  return contacts.some((c) => (c?.reachability ?? 0) >= REACHABILITY_MIN);
}

function tier(request: ActionRequest): string | undefined {
  return request.score?.tier;
}

function isStrong(request: ActionRequest): boolean {
  const t = tier(request);
  return t === "S" || t === "A";
}

function isJobOrIntern(request: ActionRequest): boolean {
  const c = request.opportunity?.category;
  return c === "Job" || c === "Internship";
}

function isCategory(request: ActionRequest, category: string): boolean {
  return request.opportunity?.category === category;
}

// ============================================================
// The decision table (ORDER IS SIGNIFICANT — first match wins)
// ============================================================

/**
 * Ordered decision rules from docs/engine-specs.md Section 4. The pipeline-thin
 * promotion is rule 0 (fires before C → Ignore); the catch-all is last.
 */
export const RULES: Rule[] = [
  // 0. Pipeline-thin override (human-toggled): top-of-C → Outreach, before C → Ignore.
  {
    predicate: (r, o) =>
      tier(r) === "C" && o.pipeline_thin && (r.score?.total ?? 0) >= PIPELINE_THIN_TOP_OF_C_MIN,
    action: "Outreach",
    reason: "Top-of-C tier in thin-pipeline mode — pursuing despite lower score",
  },

  // 1. C / * / * → Ignore (unless pipeline thin, handled above).
  {
    predicate: (r) => tier(r) === "C",
    action: "Ignore",
    reason: "C-tier: skip or minimal effort to conserve effort",
  },

  // 2. * / OSS / yes → Outreach (relationship-led, no apply form).
  {
    predicate: (r) => isCategory(r, "OSS") && isReachable(r),
    action: "Outreach",
    reason: "OSS is relationship-led — no apply form; reach the contact",
  },

  // 3. * / OSS / no → Outreach (find/warm a contact first).
  {
    predicate: (r) => isCategory(r, "OSS") && !isReachable(r),
    action: "Outreach",
    reason: "OSS is relationship-led — find or warm a contact first",
  },

  // 4. S·A / Job·Intern / yes → Both.
  {
    predicate: (r) => isStrong(r) && isJobOrIntern(r) && isReachable(r),
    action: "Both",
    reason: "Strong-fit job/internship with a reachable human — apply and reach out",
  },

  // 5. S·A / Job·Intern / no → Apply.
  {
    predicate: (r) => isStrong(r) && isJobOrIntern(r) && !isReachable(r),
    action: "Apply",
    reason: "Strong-fit job/internship, no reachable human — formal application only",
  },

  // 6. S·A / Freelance / yes → Outreach.
  {
    predicate: (r) => isStrong(r) && isCategory(r, "Freelance") && isReachable(r),
    action: "Outreach",
    reason: "Freelance is won by pitch, not application — reach out",
  },

  // 7. S·A / Freelance / no → Apply.
  {
    predicate: (r) => isStrong(r) && isCategory(r, "Freelance") && !isReachable(r),
    action: "Apply",
    reason: "Freelance, no reachable contact — submit a platform proposal",
  },

  // 8. S·A / Startup / yes → Both.
  {
    predicate: (r) => isStrong(r) && isCategory(r, "Startup") && isReachable(r),
    action: "Both",
    reason: "Strong-fit startup with a reachable human — apply and reach out",
  },

  // 9. S·A / Startup / no → Outreach (startups hire via network; cold-reach founder).
  {
    predicate: (r) => isStrong(r) && isCategory(r, "Startup") && !isReachable(r),
    action: "Outreach",
    reason: "Startups hire via network — cold-reach the founder",
  },

  // 10. B / Job·Intern / yes → Outreach (apply only if effort low; lead with human).
  {
    predicate: (r) => tier(r) === "B" && isJobOrIntern(r) && isReachable(r),
    action: "Outreach",
    reason: "B-tier job/internship — apply only if effort is low; lead with the human",
  },

  // 11. B / * / no → Ignore (conserve effort).
  {
    predicate: (r) => tier(r) === "B" && !isReachable(r),
    action: "Ignore",
    reason: "B-tier with no reachable contact — conserve effort",
  },

  // 12. Catch-all → Ignore (totality guarantee for any unlisted combination).
  {
    predicate: () => true,
    action: "Ignore",
    reason: "No matching rule — default to ignore",
  },
];
