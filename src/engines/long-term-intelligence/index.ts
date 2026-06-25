// index.ts
// File: src/engines/long-term-intelligence/index.ts
// Purpose: Public surface of the Long-Term Intelligence Engine (Engine 12).

export { computeIntelligence } from "./long-term-intelligence";

export type {
  ScoredOutcome,
  EvidenceCitation,
  IntelligenceRequest,
  SourceWeightSuggestion,
  CalibrationSuggestion,
  EvidenceSignalItem,
  DataGateStatus,
  IntelligenceUpdate,
} from "./types";
