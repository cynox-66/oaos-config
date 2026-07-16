// types.ts
// File: src/engines/application-package/types.ts
// Purpose: Type definitions for the Application Package Engine (Engine 6).
//          Mirrors docs/engine-specs.md Section 6. Opportunity / EvidenceMatch /
//          Evidence / GeminiClient are input-only views from Engines 1, 3, and 2.

import type { Opportunity } from "../normalization/types";
import type { Evidence, EvidenceMatch } from "../evidence-matching/types";
import type { GeminiClient } from "../scoring/types";

export type { Opportunity, Evidence, EvidenceMatch, GeminiClient };

// ============================================================
// Base resume (structured) — also the shape of resume_variant
// ============================================================

/** One employment entry. */
export interface ExperienceEntry {
  company: string;
  title: string;
  dates: string;
  bullets: string[];
}

/** One project entry. */
export interface ProjectEntry {
  name: string;
  url?: string;
  description: string;
  bullets: string[];
  tech_tags: string[];
}

/** One education entry. */
export interface EducationEntry {
  institution: string;
  degree: string;
  dates: string;
}

/**
 * The operator's structured base resume. `resume_variant` is the SAME shape — a
 * reordered/re-emphasized version produced by {@link buildResumeVariant}.
 */
export interface BaseResume {
  name: string;
  summary: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skills: string[];
}

/** The operator's profile (context for the cover letter). */
export interface OperatorProfile {
  name: string;
  github: string;
  portfolio_url: string;
  stack: string[];
}

// ============================================================
// Inputs / outputs
// ============================================================

/**
 * Input to {@link buildApplicationPackage}. `inventory` resolves the
 * `evidence_id`s carried by `match.ranked` into full {@link Evidence} objects
 * (EvidenceMatch deliberately carries only ids).
 */
export interface PackageRequest {
  opportunity: Opportunity;
  match: EvidenceMatch;
  inventory: Evidence[];
  base_resume: BaseResume;
  operator: OperatorProfile;
  role_description: string;
}

/** Result of the fabrication trace-check (GAP B). */
export interface FabricationResult {
  fabrication_check: "pass" | "flag";
  /** Sentences that failed the check (empty on pass). */
  flagged_sentences: string[];
  /**
   * True when the semantic (Layer 2) check could not run — LLM error or
   * unparseable verdict. The result is then the hard-rule (Layer 1) result
   * alone; never a silent downgrade of a flag to a pass.
   */
  semantic_degraded?: boolean;
}

/** The generated application package (spec ApplicationPackage + flagged_sentences). */
export interface ApplicationPackage {
  resume_variant: BaseResume;
  cover_letter: string;
  evidence_cited: string[];
  fabrication_check: "pass" | "flag";
  /** Sentences that failed the fabrication check (empty on pass). */
  flagged_sentences: string[];
  /** What to verify before submitting (proof-thin / truncation warnings). */
  notes: string;
}

/** Optional controls for {@link buildApplicationPackage}. */
export interface PackageOptions {
  /** Injected Gemini client (defaults to a real one). */
  client?: GeminiClient;
}
