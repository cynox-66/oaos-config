// types.ts
// File: src/engines/outreach-package/types.ts
// Purpose: Type definitions for the Outreach Package Engine (Engine 7).
//          Mirrors docs/engine-specs.md Section 7 + STEP 2. Contact /
//          Opportunity / EvidenceMatch / Evidence / GeminiClient are input-only
//          views from Engines 5, 1, 3, and 2.

import type { Opportunity } from "../normalization/types";
import type { Contact } from "../contact-ranking/types";
import type { Evidence, EvidenceMatch } from "../evidence-matching/types";
import type { GeminiClient } from "../scoring/types";

export type { Opportunity, Contact, Evidence, EvidenceMatch, GeminiClient };

// ============================================================
// Enums
// ============================================================

/** Outreach channel (frozen by STEP 2). */
export type Channel = "email" | "linkedin_connect" | "linkedin_dm" | "github" | "slack";

/** The kind of ask the outreach makes. */
export type AskType =
  | "internship_inquiry"
  | "oss_contribution"
  | "advice"
  | "collaboration"
  | "freelance_pitch"
  | "referral_request";

// ============================================================
// Inputs
// ============================================================

/** Input to {@link buildOutreachDraft}. */
export interface OutreachRequest {
  /** The primary contact to reach. */
  contact: Contact;
  opportunity: Opportunity;
  match: EvidenceMatch;
  /** Resolves `match.ranked[0].evidence_id` to a full {@link Evidence}. */
  inventory: Evidence[];
  ask_type: AskType;
  channel: Channel;
}

/** Optional controls for {@link buildOutreachDraft}. */
export interface OutreachOptions {
  /** Injected Gemini client (defaults to a real one). */
  client?: GeminiClient;
}

/** The single evidence asset cited (ranked[0]) plus its relevance reason. */
export interface ProofPoint {
  evidence: Evidence;
  reason: string;
}

// ============================================================
// Outputs
// ============================================================

/** A generated, constraint-checked outreach draft (spec OutreachDraft + STEP 2). */
export interface OutreachDraft {
  channel: Channel;
  /** Subject line (email only); null for channels without one. */
  subject: string | null;
  body: string;
  /** Word count of the BODY only. */
  word_count: number;
  /** Character count of the BODY only (drives the linkedin_connect ≤300 rule). */
  char_count: number;
  /** The single cited evidence id (ranked[0]), or null in the sparse path. */
  evidence_referenced: string | null;
  /** True when all length/format + single-evidence + banned-phrase rules pass. */
  constraint_pass: boolean;
  /** Human-readable violations (empty when constraint_pass). */
  constraint_violations: string[];
  /** What to verify before sending (always populated). */
  customization_notes: string;
}

/** Result of the pure, draft-intrinsic constraint check. */
export interface ConstraintResult {
  pass: boolean;
  violations: string[];
}
