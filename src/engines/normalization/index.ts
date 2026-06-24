// index.ts
// File: src/engines/normalization/index.ts
// Purpose: Public surface of the Opportunity Normalization Engine (Engine 1).

export { normalize, merge } from "./normalize";
export { selectAdapter, ADAPTERS, manualAdapter, jobBoardAdapter } from "./adapters";

export type {
  RawItem,
  Opportunity,
  SourceAdapter,
  AdapterOutput,
  SourceType,
  Category,
  CompBasis,
  Remote,
  Domain,
} from "./types";
