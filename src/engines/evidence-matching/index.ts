// index.ts
// File: src/engines/evidence-matching/index.ts
// Purpose: Public surface of the Evidence Matching Engine (Engine 3).

export {
  match,
  rankEvidence,
  computeFit,
  computeRecencyFactor,
  computeCoverageGap,
  buildOpportunityTags,
  extractTagsFromText,
  allInventoryTags,
  classifyOpportunity,
} from "./match";
export { parseInventory, loadInventory } from "./inventory";
export {
  tokenize,
  allowedTokens,
  countSuspiciousTokens,
  isFabricated,
  fallbackReason,
  buildReasonPrompt,
  buildStrictReasonPrompt,
  parseReason,
} from "./prompt";

export type {
  Evidence,
  EvidenceType,
  MatchRequest,
  EvidenceMatch,
  RankedEvidence,
  MatchOptions,
  ScoredCandidate,
} from "./types";
