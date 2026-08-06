// index.ts
// File: src/discovery/scope/index.ts
// Purpose: Public surface of the Discovery Scope module (Phase 1 Wave 1, D15).

export { deriveScope, computeBacking, normalizeTerm } from "./generator";
export {
  loadPreferences,
  loadBaseline,
  writePreferences,
  parsePreferences,
  parseBaseline,
  ScopeValidationError,
} from "./preferences";
export { reduceScope, parseScopeCommand, initialState, buildPreferences } from "./reducer";
export {
  SCOPE_VOCABULARY,
  PREFERENCES_VERSION,
  DEFAULT_PREFERENCES_PATH,
  PROPOSED_WORK_TYPES,
} from "./config";
export {
  SENIORITY_LEVELS,
  SENIORITY_LEVEL_IDS,
  ALL_SENIORITY_TERMS,
  ENTRY_LEVEL_MODIFIER,
  seniorityLevel,
  seniorityNegativeTerms,
  entryLevelModifier,
} from "./seniority";

export type {
  Preferences,
  ScopeBaseline,
  ScopeField,
  WorkTypeSelection,
  WorkTypeKey,
  FieldOrigin,
  FieldBacking,
  ScopeInputs,
  ScopeDeps,
  ScopeProposal,
  ScopeState,
  ScopeAction,
  ScopeCommand,
  SeniorityLevelId,
  SeniorityLevelSelection,
  SeniorityLevelState,
  SeniorityPreference,
  SeniorityProposal,
} from "./types";
export type { SeniorityLevelDefinition } from "./seniority";
