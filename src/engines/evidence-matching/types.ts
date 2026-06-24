// types.ts
// File: src/engines/evidence-matching/types.ts
// Purpose: Type definitions for the Evidence Matching Engine (Engine 3).
//          Mirrors docs/engine-specs.md Section 3. The produced EvidenceMatch
//          is structurally compatible with the input-view EvidenceMatch Engine
//          2 declared (see the assignability check in the test suite).

import type { Opportunity } from "../normalization/types";
import type { GeminiClient } from "../scoring";

export type { Opportunity, GeminiClient };

// ============================================================
// Evidence (the inventory asset)
// ============================================================

/** Evidence asset type (frozen by spec). */
export type EvidenceType =
  | "PR"
  | "Article"
  | "RFC"
  | "Project"
  | "Talk"
  | "Freelance"
  | "Client";

/**
 * A single evidence asset from the operator's inventory (the C4 source of
 * truth, `evidence/inventory.md`). Read-only input to this engine.
 */
export interface Evidence {
  id: string;
  title: string;
  type: EvidenceType;
  url: string;
  /** Technology tags (e.g. "eBPF", "Kubernetes"). */
  tech_tags: string[];
  /** Domain labels (controlled-vocab strings). */
  domains: string[];
  /** One-line human blurb describing what this asset proves. */
  relevance_blurb: string;
  /** ISO-8601 date the work was done/published. */
  recency_date: string;
  /** Subjective strength, 1..5. */
  strength: number;
}

// ============================================================
// Inputs / outputs
// ============================================================

/** Input to {@link match}: an opportunity plus the full evidence inventory. */
export interface MatchRequest {
  opportunity: Opportunity;
  inventory: Evidence[];
}

/** One ranked evidence asset with its fit and LLM-generated reason. */
export interface RankedEvidence {
  evidence_id: string;
  /** 0..1 fit score from the spec formula. */
  fit_score: number;
  /** One-line relevance reason (LLM, grounded; falls back to relevance_blurb). */
  reason: string;
}

/**
 * The match result (spec EvidenceMatch). Declared as a `type` (not `interface`)
 * so it carries an implicit index signature and is therefore assignable to
 * Engine 2's input-view EvidenceMatch (`{ id?: string; top_score: number;
 * [key: string]: unknown }`) — verified by a compile-time check in the tests.
 */
export type EvidenceMatch = {
  /** Deterministic id: sha1(fingerprint | ranked evidence ids). */
  id: string;
  /** Ranked assets, length ≤ 3, all with fit ≥ floor. */
  ranked: RankedEvidence[];
  /** ranked[0].fit_score, or 0 when ranked is empty. */
  top_score: number;
  /** The top required capability nothing proves (fit ≥ 0.4), or null. */
  coverage_gap: string | null;
};

// ============================================================
// Options
// ============================================================

/** Optional controls for {@link match}. */
export interface MatchOptions {
  /** Injected Gemini client (defaults to a real one). */
  client?: GeminiClient;
  /** Reference clock for recency decay (default: now). */
  now?: Date | string;
}

/** Internal: a candidate evidence asset with its computed fit. */
export interface ScoredCandidate {
  evidence: Evidence;
  fit_score: number;
}
