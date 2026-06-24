// config.ts
// File: src/engines/recommended-action/config.ts
// Purpose: Static configuration for the Recommended Action Engine (Engine 4):
//          the reachability threshold, the human-review confidence cutoff, and
//          the pipeline-thin top-of-C threshold. All tunables live here.

/** "contact reachable" = exists a Contact with reachability ≥ this (spec). */
export const REACHABILITY_MIN = 3;

/** requires_human_review when score.confidence is below this (spec). */
export const HUMAN_REVIEW_CONFIDENCE_MAX = 0.6;

/** In pipeline-thin mode, only C-tier with total ≥ this is promoted (GAP/ITEM 4). */
export const PIPELINE_THIN_TOP_OF_C_MIN = 45;
