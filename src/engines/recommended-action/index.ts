// index.ts
// File: src/engines/recommended-action/index.ts
// Purpose: Public surface of the Recommended Action Engine (Engine 4).

export { recommend } from "./recommend";
export { RULES, isReachable } from "./rules";

export type {
  Action,
  Recommendation,
  ActionRequest,
  ActionOptions,
  ResolvedOptions,
  Rule,
} from "./types";
