// index.ts
// File: src/engines/source-admission/index.ts
// Purpose: Public surface of the Discovery Source Admission Engine (Engine 11).

export { admitSource } from "./source-admission";
export { GLOBAL_MAINT_BUDGET_MIN_PER_WEEK } from "./config";

export type {
  IngestionType,
  SourceProposal,
  AdmittedSource,
  AdmissionDecision,
} from "./types";
