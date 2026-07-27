// index.ts
// File: src/discovery/orchestrator/index.ts
// Purpose: Public surface of the Stage-3 run coordinator (Phase 1 Wave 6).

export { runStage3, reenableSource } from "./orchestrator";
export { STAGE3_SOURCES, findSourceEntry, sourceNames } from "./sources";
export {
  createHealthStore,
  createMemoryHealthStore,
  parseHealthFile,
  serializeHealthFile,
  HealthStoreError,
  HEALTH_PATH,
  HEALTH_FILE_VERSION,
} from "./health-store";
export { createSourceDeps, USER_AGENT, REQUEST_TIMEOUT_MS } from "./http";
export { preferencesToVocabulary } from "./vocabulary";

export type { ReenableResult } from "./orchestrator";
export type {
  CalendarSinkResult,
  HealthStore,
  ProcessStage3Item,
  SourceBuildContext,
  SourceHealthSummary,
  SourceRunStatus,
  SourceRunSummary,
  SourceTableEntry,
  Stage3RunDeps,
  Stage3RunSummary,
} from "./types";
