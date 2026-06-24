// recommend.ts
// File: src/engines/recommended-action/recommend.ts
// Purpose: The public surface of the Recommended Action Engine (Engine 4):
//          a pure, synchronous function that walks the ordered decision table
//          and applies the requires_human_review / coverage-gap rules. No LLM,
//          no network, no async.

import type { ActionOptions, ActionRequest, Recommendation, ResolvedOptions } from "./types";
import { RULES } from "./rules";
import { HUMAN_REVIEW_CONFIDENCE_MAX } from "./config";

/** The coverage_gap string when present (non-null, non-empty), else null. */
function coverageGap(request: ActionRequest): string | null {
  const gap = request.evidence_match?.coverage_gap;
  return typeof gap === "string" && gap.length > 0 ? gap : null;
}

/**
 * requires_human_review = confidence < 0.6 OR tier_uncertain OR coverage_gap
 * present (spec). Independent of the chosen action. Defensive against missing
 * score fields.
 */
function requiresHumanReview(request: ActionRequest): boolean {
  const confidence = request.score?.confidence;
  const lowConfidence = typeof confidence === "number" && confidence < HUMAN_REVIEW_CONFIDENCE_MAX;
  const uncertain = request.score?.tier_uncertain === true;
  return lowConfidence || uncertain || coverageGap(request) !== null;
}

/**
 * Map a scored opportunity to a recommended action. Pure and deterministic;
 * never throws (a malformed request falls through to the catch-all → Ignore).
 *
 * @param request opportunity + score + contacts + optional evidence_match.
 * @param options.pipeline_thin human-toggled top-of-C promotion (default false).
 */
export function recommend(
  request: ActionRequest,
  options: ActionOptions = {}
): Recommendation {
  const resolved: ResolvedOptions = { pipeline_thin: options.pipeline_thin ?? false };

  // First matching rule wins; the catch-all guarantees one always matches.
  const rule = RULES.find((r) => r.predicate(request, resolved)) ?? RULES[RULES.length - 1];

  const gap = coverageGap(request);
  const reason = gap !== null ? `${rule.reason} (coverage gap: ${gap})` : rule.reason;

  return {
    action: rule.action,
    reason,
    requires_human_review: requiresHumanReview(request),
  };
}
