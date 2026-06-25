// index.ts
// File: src/engines/income-attribution/index.ts
// Purpose: Public surface of the Income Attribution Engine (Engine 10).

export { computeAttribution } from "./income-attribution";

export type {
  OutreachLogEntry,
  AttributionRecord,
  AttributionRollup,
  AttributionResult,
} from "./types";
