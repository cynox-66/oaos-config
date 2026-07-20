// index.ts
// File: src/discovery/prerank/index.ts
// Purpose: Public surface of the Prerank Gate (Stage-3 pre-filter).

export { prerank } from "./prerank";
export {
  DEFAULT_PRERANK_CONFIG,
  DEFAULT_VOCABULARY,
  MIN_TEXT_CHARS,
  ONSITE_PATTERNS,
  REMOTE_PATTERNS,
} from "./config";

export type {
  GateReason,
  GatedItem,
  PrerankConfig,
  PrerankDeps,
  PrerankRequest,
  PrerankResult,
  PrerankStats,
  PrerankVocabulary,
} from "./types";
