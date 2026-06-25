// types.ts
// File: src/engines/follow-up/types.ts
// Purpose: Type definitions for the Follow-Up Engine (Engine 8). Mirrors
//          docs/engine-specs.md Section 8 + STEP 2. Opportunity / Contact /
//          OutreachDraft / Channel / Evidence / GeminiClient are input-only
//          views from Engines 1, 5, 7, 3, and 2.

import type { Opportunity } from "../normalization/types";
import type { Contact } from "../contact-ranking/types";
import type { Channel, OutreachDraft } from "../outreach-package/types";
import type { Evidence } from "../evidence-matching/types";
import type { GeminiClient } from "../scoring/types";

export type { Opportunity, Contact, Channel, OutreachDraft, Evidence, GeminiClient };

// ============================================================
// Enums
// ============================================================

/** Status of the original/last-sent outreach. */
export type OutreachStatus = "Sent" | "Replied" | "No_Response" | "Bounced" | "Cancelled";

/** Why the sequence terminated (encodes the terminal status). */
export type TerminalReason =
  | "replied"
  | "no_response"
  | "bounced"
  | "cancelled"
  | "oss_suppressed";

// ============================================================
// Inputs
// ============================================================

/**
 * Input to {@link buildFollowUp} / {@link computeNextStep}.
 *
 * `step` is the last-sent state: 0 = original outreach sent, 1 = FU1 sent,
 * 2 = FU2 sent, 3 = FU3 sent. The engine prepares the NEXT follow-up.
 */
export interface FollowUpRequest {
  outreach_id: string;
  sent_date: Date;
  channel: Channel;
  status: OutreachStatus;
  /** Last-sent step, 0..3. */
  step: number;
  original_draft: OutreachDraft;
  opportunity: Opportunity;
  contact: Contact;
  /** New evidence to cite in the follow-up, if any. */
  new_evidence?: Evidence | null;
  /** Recent target activity (shipped/posted) to reference, if any. */
  recent_activity?: string | null;
}

/** Optional controls. */
export interface FollowUpOptions {
  /** Injected Gemini client (defaults to a real one). */
  client?: GeminiClient;
  /** Reference clock for determinism; does NOT gate behavior (see state-machine). */
  now?: Date;
}

// ============================================================
// Output
// ============================================================

/**
 * The follow-up state. `step` is the follow-up being prepared (request.step+1)
 * when scheduling, or the terminal step. `draft` is null when terminal or not
 * yet generated.
 */
export interface FollowUpState {
  outreach_id: string;
  /** The follow-up number this state concerns (0..3). */
  step: number;
  /** When the next follow-up is due, or null when terminal. */
  next_due: Date | null;
  /** The generated follow-up draft, or null. */
  draft: OutreachDraft | null;
  terminal: boolean;
  /** Why it terminated, or null when not terminal. */
  terminal_reason: TerminalReason | null;
}
