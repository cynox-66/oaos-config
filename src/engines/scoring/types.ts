// types.ts
// File: src/engines/scoring/types.ts
// Purpose: Type definitions for the Opportunity Scoring Engine (Engine 2).
//          Mirrors docs/engine-specs.md Section 2. Contact / EvidenceMatch /
//          Research are INPUT-ONLY views of other engines' outputs (Engines 3,
//          5, and the research enrichment) — Engine 2 reads them, never builds
//          them, and declares only the fields it consumes.

import type { Opportunity } from "../normalization/types";

export type { Opportunity };

// ============================================================
// Input-facing enums (from upstream engines)
// ============================================================

/** Company stage label from research enrichment (drives quality.stage). */
export type ResearchStage =
  | "seed"
  | "series-a"
  | "series-b"
  | "growth"
  | "public"
  | "unknown";

/** OSS involvement label from research enrichment (drives quality.oss). */
export type OssInvolvement = "maintains" | "contributes" | "uses" | "none";

/** Relationship strength on a Contact (drives match.network). */
export type ContactRelationship =
  | "Met"
  | "Warm"
  | "GitHub Interaction"
  | "Slack"
  | "Cold";

// ============================================================
// Inputs
// ============================================================

/**
 * Research enrichment output (opaque object). Engine 2 reads only `stage` and
 * `oss_involvement`; other fields are preserved for hashing but otherwise
 * ignored here.
 */
export interface Research {
  stage?: ResearchStage | string | null;
  oss_involvement?: OssInvolvement | string | null;
  [key: string]: unknown;
}

/**
 * Input view of a Contact (Engine 5 output). Engine 2 reads only `id`,
 * `reachability` (1..5), and `relationship`.
 */
export interface Contact {
  id: string;
  reachability: number;
  relationship: ContactRelationship;
}

/**
 * Input view of an EvidenceMatch (Engine 3 output). Engine 2 reads `id` (when
 * present, for hashing) and `top_score` (0..1, drives match.evidence). `id` is
 * optional until Engine 3 ships its type.
 */
export interface EvidenceMatch {
  id?: string;
  top_score: number;
  [key: string]: unknown;
}

/**
 * The full input to {@link computeScore}. Matches the spec's ScoreRequest.
 */
export interface ScoreRequest {
  opportunity: Opportunity;
  research: Research | null;
  contacts: Contact[];
  evidence_match: EvidenceMatch | null;
}

// ============================================================
// LLM pass
// ============================================================

/** The exact JSON the Gemini LLM pass is instructed to return (GAP 9). */
export interface LLMScoreFactors {
  quality_domain: number;
  quality_leverage: number;
  match_overlap: number;
  rationale: string;
}

/**
 * Thin, injectable Gemini client. Tests provide a mock; production uses
 * {@link createGeminiClient}.
 */
export interface GeminiClient {
  /** Send a prompt, return the raw model text. Throws on transport failure. */
  generate(prompt: string): Promise<string>;
}

// ============================================================
// Output — the Score record
// ============================================================

export type Tier = "S" | "A" | "B" | "C";

/** Quality axis breakdown (0..50 total). */
export interface QualityBreakdown {
  domain: number;
  oss: number;
  leverage: number;
  stage: number;
  total: number;
}

/** Match axis breakdown (0..50 total). */
export interface MatchBreakdown {
  overlap: number;
  evidence: number;
  contact: number;
  network: number;
  total: number;
}

/**
 * The scoring result. Matches the spec's Score output. `tier_uncertain` is a
 * spec Decision-Rule flag surfaced as a first-class field (as Engine 1 did with
 * its prose-mandated fields).
 */
export interface Score {
  quality: QualityBreakdown;
  match: MatchBreakdown;
  total: number;
  tier: Tier;
  confidence: number;
  rationale: string;
  scored_at: string;
  inputs_hash: string;
  /** total within 2 of a tier boundary AND confidence < 0.6. */
  tier_uncertain: boolean;
}

/**
 * Deterministic factor subset produced by {@link computeRulePass} — the
 * "Partial<Score>" the spec refers to (the rule-derived factors only).
 */
export interface RulePassFactors {
  quality: Pick<QualityBreakdown, "oss" | "stage">;
  match: Pick<MatchBreakdown, "contact" | "evidence" | "network">;
}

/** Optional controls for {@link computeScore}. */
export interface ComputeScoreOptions {
  /** Injected Gemini client (defaults to {@link createGeminiClient}). */
  client?: GeminiClient;
  /** A previously stored Score; returned unchanged when its inputs_hash matches. */
  previous?: Score | null;
  /** Fixed `scored_at` (for deterministic tests); defaults to now. */
  now?: string;
}
