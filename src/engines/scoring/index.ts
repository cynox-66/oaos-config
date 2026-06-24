// index.ts
// File: src/engines/scoring/index.ts
// Purpose: Public surface of the Opportunity Scoring Engine (Engine 2).

export {
  computeScore,
  computeRulePass,
  mergeScores,
  parseAndValidateLLMResponse,
  computeInputsHash,
} from "./score";
export { buildPrompt, STRICT_RETRY_PREFIX, RUBRIC_LLM_FACTORS } from "./prompt";
export { createGeminiClient } from "./gemini";

export type {
  ScoreRequest,
  Score,
  QualityBreakdown,
  MatchBreakdown,
  Tier,
  RulePassFactors,
  LLMScoreFactors,
  GeminiClient,
  ComputeScoreOptions,
  Research,
  Contact,
  EvidenceMatch,
  ResearchStage,
  OssInvolvement,
  ContactRelationship,
} from "./types";
