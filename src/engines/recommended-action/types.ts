// types.ts
// File: src/engines/recommended-action/types.ts
// Purpose: Type definitions for the Recommended Action Engine (Engine 4).
//          Mirrors docs/engine-specs.md Section 4. Opportunity / Score /
//          Contact / EvidenceMatch are INPUT-ONLY views of other engines'
//          outputs (Engines 1, 2, 5, 3); Engine 4 reads them, never builds them.

import type { Opportunity } from "../normalization/types";
import type { Score, Contact } from "../scoring/types";
import type { EvidenceMatch } from "../evidence-matching/types";

export type { Opportunity, Score, Contact, EvidenceMatch };

// ============================================================
// Output
// ============================================================

/** The recommended action (frozen by spec). */
export type Action = "Apply" | "Outreach" | "Both" | "Ignore";

/** The engine's verdict for one opportunity. */
export interface Recommendation {
  action: Action;
  /** Human-readable justification (the matched rule's reason, gap-augmented). */
  reason: string;
  /** True when confidence < 0.6 OR tier_uncertain OR coverage_gap present. */
  requires_human_review: boolean;
}

// ============================================================
// Input
// ============================================================

/**
 * Full input to {@link recommend}. `evidence_match` is optional and only its
 * `coverage_gap` is consulted (see {@link Rule}).
 */
export interface ActionRequest {
  opportunity: Opportunity;
  score: Score;
  contacts: Contact[];
  // top_score intentionally unused: feeds scoring (E2), not action
  evidence_match?: EvidenceMatch | null;
}

/** Human-toggled options. */
export interface ActionOptions {
  /** Pipeline-thin mode: promote top-of-C from Ignore to Outreach. Default false. */
  pipeline_thin?: boolean;
}

/** Options after defaults are applied. */
export interface ResolvedOptions {
  pipeline_thin: boolean;
}

// ============================================================
// Decision table rule
// ============================================================

/**
 * One row of the decision table: a predicate, the action it yields, and a
 * baked-in human-readable reason. Rules are evaluated top-down; first match
 * wins. The final rule is a catch-all guaranteeing totality.
 */
export interface Rule {
  predicate: (request: ActionRequest, options: ResolvedOptions) => boolean;
  action: Action;
  reason: string;
}
