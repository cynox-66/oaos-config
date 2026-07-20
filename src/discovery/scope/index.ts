// index.ts
// File: src/discovery/scope/index.ts
// Purpose: Public surface of the Discovery Scope module (Phase 1 Wave 1, D15).

export { deriveScope, computeBacking, normalizeTerm } from "./generator";
export {
  loadPreferences,
  writePreferences,
  parsePreferences,
  ScopeValidationError,
} from "./preferences";
export { reduceScope, parseScopeCommand, initialState, buildPreferences } from "./reducer";
export {
  SCOPE_VOCABULARY,
  PREFERENCES_VERSION,
  DEFAULT_PREFERENCES_PATH,
  PROPOSED_WORK_TYPES,
} from "./config";

export type {
  Preferences,
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
} from "./types";
