// types.ts
// File: src/discovery/prerank/types.ts
// Purpose: Canonical type definitions for the Prerank Gate — the pure lexical
//          pre-filter that sits between Stage-3 discovery batches and the
//          Gemini-powered pipeline. No LLM, no network, no file I/O.

import type { RawItem } from "../../engines/normalization/types";

// ============================================================
// Enums (string literal unions)
// ============================================================

/** Why an item did not reach the pipeline. Every gated item carries exactly one. */
export type GateReason =
  | "insufficient_text"
  | "negative_term"
  | "location"
  | "below_floor"
  | "beyond_k";

// ============================================================
// Inputs
// ============================================================

/**
 * Lexical vocabulary driving relevance. Plain data supplied by the caller —
 * the module never reads it from disk. In Wave 1 this is sourced from
 * preferences.json; today it comes from config.DEFAULT_VOCABULARY or fixtures.
 *
 * Terms are lowercased. Multi-word phrases ("site reliability") are supported
 * and matched with word boundaries.
 */
export interface PrerankVocabulary {
  /** Engine 1's controlled domain vocabulary plus common surface variants. */
  domainTerms: string[];
  /** Role keywords (engineer, sre, devops, intern, platform, ...). */
  roleTerms: string[];
  /** Hard-exclusion terms. Typically empty; config-supplied per source. */
  negativeTerms: string[];
}

/** Tunables. Defaults live in config.ts and are merged under per-call overrides. */
export interface PrerankConfig {
  /** Max items allowed through per invocation. Sizes the Gemini budget. */
  maxPerRun: number;
  /** Normalized relevance score strictly below this is gated. */
  relevanceFloor: number;
  /** When true, onsite-indicating items without a remote marker are gated. */
  remoteOnly: boolean;
}

export interface PrerankRequest {
  items: RawItem[];
  /** Required — there is deliberately no implicit vocabulary fallback. */
  vocabulary: PrerankVocabulary;
  /** Merged over DEFAULT_PRERANK_CONFIG; omit to accept all defaults. */
  config?: Partial<PrerankConfig>;
}

/** Injected only to keep output deterministic under test. */
export interface PrerankDeps {
  /** Returns the run timestamp as ISO-8601. Defaults to the wall clock. */
  now?: () => string;
}

// ============================================================
// Outputs
// ============================================================

export interface GatedItem {
  item: RawItem;
  reason: GateReason;
  /** Normalized 0..1 relevance, or null when gated before scoring. */
  score: number | null;
}

/** Per-run counters, shaped for Engine 9 (Source Performance) consumption. */
export interface PrerankStats {
  total: number;
  passed: number;
  gated: number;
  /** Every GateReason key is present, zero-filled. */
  gatedByReason: Record<string, number>;
  /** ISO-8601. */
  runTimestamp: string;
}

export interface PrerankResult {
  /** <= maxPerRun, ordered by score desc (fetched_at desc as tiebreak). */
  passed: RawItem[];
  gated: GatedItem[];
  stats: PrerankStats;
}
