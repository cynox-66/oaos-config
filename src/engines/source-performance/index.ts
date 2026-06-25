// index.ts
// File: src/engines/source-performance/index.ts
// Purpose: Public surface of the Source Performance Engine (Engine 9).

export { computeSourcePerformance, computeOriginatingSources } from "./source-performance";

export type {
  OutcomeType,
  IncomeKind,
  OutcomeEvent,
  SourceRates,
  SourceReport,
} from "./types";
