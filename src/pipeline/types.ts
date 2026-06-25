// types.ts
// File: src/pipeline/types.ts
// Purpose: Types for the OAOS intake pipeline — the options bag, the assembled
//          result, and re-exports of the engine types the result is built from.
//          The pipeline introduces NO new behavior; it only wires engines.

import type { RawItem, Opportunity } from "../engines/normalization/types";
import type { Score, GeminiClient } from "../engines/scoring/types";
import type { Evidence, EvidenceMatch } from "../engines/evidence-matching/types";
import type { Recommendation } from "../engines/recommended-action/types";
import type { RankedContacts, DiscoveryRequest } from "../engines/contact-ranking/types";
import type {
  BaseResume,
  OperatorProfile,
  ApplicationPackage,
} from "../engines/application-package/types";
import type { AskType, Channel, OutreachDraft } from "../engines/outreach-package/types";
import type { FollowUpState } from "../engines/follow-up/types";

export type {
  RawItem,
  Opportunity,
  Score,
  GeminiClient,
  Evidence,
  EvidenceMatch,
  Recommendation,
  RankedContacts,
  DiscoveryRequest,
  BaseResume,
  OperatorProfile,
  ApplicationPackage,
  AskType,
  Channel,
  OutreachDraft,
  FollowUpState,
};

/**
 * Options for {@link runPipeline}. `inventory` and `contacts_input` are always
 * required; the rest gate optional downstream steps.
 */
export interface PipelineOptions {
  /** The evidence inventory (resolves EvidenceMatch ids for E6/E7). */
  inventory: Evidence[];
  /** Candidate sources for contact discovery (its `opportunity` is overridden). */
  contacts_input: DiscoveryRequest;
  /** Required (with operator_profile) to build an application package. */
  base_resume?: BaseResume;
  /** Required (with base_resume) to build an application package. */
  operator_profile?: OperatorProfile;
  /** Required (with channel) to build an outreach draft. */
  ask_type?: AskType;
  /** Required (with ask_type) to build an outreach draft. */
  channel?: Channel;
  /** Human-toggled pipeline-thin mode (Engine 4). */
  pipeline_thin?: boolean;
  /** Injected Gemini client, threaded to every LLM engine. */
  gemini_client?: GeminiClient;
  /** Reference clock; one instant is held for the whole run. */
  now?: Date;
}

/**
 * The full result of one intake run. `applicationPackage` / `outreachDraft` are
 * null when their gating conditions aren't met; `followUpState` is always null
 * at intake (Engine 8 runs only after a send).
 */
export interface PipelineResult {
  opportunity: Opportunity;
  score: Score;
  evidenceMatch: EvidenceMatch;
  recommendation: Recommendation;
  contacts: RankedContacts;
  applicationPackage: ApplicationPackage | null;
  outreachDraft: OutreachDraft | null;
  followUpState: FollowUpState | null;
  timestamp: Date;
}
