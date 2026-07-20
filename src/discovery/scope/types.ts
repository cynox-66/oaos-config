// types.ts
// File: src/discovery/scope/types.ts
// Purpose: Type definitions for the Discovery Scope module (Phase 1 Wave 1,
//          decision D15). The scope is the operator-confirmed answer to "what
//          does automated discovery search for?" — persisted to preferences.json
//          and consumed later (Wave 5/6) by per-source query builders and the
//          prerank gate's vocabulary input.
//
// Two literals are LOCKED by charter and are encoded in the types themselves,
// not merely checked at runtime: `remote_only: true` and `freelance: false`.
// A hand-edited file that violates either is rejected loudly by the validator.

import type { BaseResume, OperatorProfile } from "../../engines/application-package/types";
import type { Evidence } from "../../engines/evidence-matching/types";

export type { BaseResume, OperatorProfile, Evidence };

// ============================================================
// Persisted schema (preferences.json)
// ============================================================

/** Where a scope field came from. */
export type FieldOrigin = "derived" | "operator_added";

/**
 * One searchable field in the discovery scope.
 *
 * `aspirational` is derived — `origin === "operator_added" && !evidence_backed`
 * — but stored explicitly for downstream readability (Match-score presentation
 * needs to stay honest about which fields the operator can actually prove).
 * The validator recomputes it and REJECTS a file where the invariant does not
 * hold, rather than quietly fixing it.
 *
 * Per D15, an aspirational field is NOT second-class: discovery searches it
 * identically to an evidence-backed one.
 */
export interface ScopeField {
  /** A term from Engine 1's domain vocabulary, or an operator-added custom term. */
  name: string;
  origin: FieldOrigin;
  /** True iff ≥1 evidence-inventory asset shares this domain/tag. */
  evidence_backed: boolean;
  /** True iff operator-added AND not evidence-backed (D15). */
  aspirational: boolean;
  /** The operator's tick state. Only a confirmed tick reaches this file. */
  enabled: boolean;
  /** Inventory asset ids backing this field, in inventory order. `[]` allowed. */
  supporting_evidence_ids: string[];
}

/**
 * Which kinds of work discovery pursues. `freelance` is a locked literal
 * `false` in v1 — freelance discovery is deferred by locked decision. The field
 * exists so the deferral is explicit and machine-readable; flipping it later is
 * a schema-compatible change, not a migration.
 */
export interface WorkTypeSelection {
  job: boolean;
  internship: boolean;
  oss: boolean;
  freelance: false;
}

/** The persisted discovery scope — single source of truth for what we search for. */
export interface Preferences {
  version: 1;
  /** ISO-8601 — when the field map was derived. */
  generated_at: string;
  /** ISO-8601 — set only after explicit operator confirmation. */
  confirmed_at: string;
  fields: ScopeField[];
  work_types: WorkTypeSelection;
  /** Locked literal `true` in v1 — remote-only is a charter decision. */
  remote_only: true;
}

// ============================================================
// Derivation (pure)
// ============================================================

/** Everything {@link deriveScope} needs. No paths, no I/O — the caller loads. */
export interface ScopeInputs {
  resume: BaseResume;
  profile: OperatorProfile;
  inventory: Evidence[];
  /** An existing confirmed scope, when re-running. Becomes the tick baseline. */
  existing?: Preferences;
}

/** Injected clock, so derivation is deterministic under test. */
export interface ScopeDeps {
  /** ISO-8601 "now". */
  now: string;
}

/**
 * The proposal a derivation produces. Deliberately NOT a {@link Preferences}:
 * an unconfirmed scope must not be representable as the persisted type, because
 * `confirmed_at` may only be stamped by operator confirmation.
 */
export interface ScopeProposal {
  generated_at: string;
  fields: ScopeField[];
  work_types: WorkTypeSelection;
  /**
   * Field names that gained evidence backing since the loaded baseline — new
   * evidence landed. Presentation-only; never persisted.
   */
  newly_backed: string[];
}

/** Evidence backing for a single term, computed against the inventory. */
export interface FieldBacking {
  evidence_backed: boolean;
  supporting_evidence_ids: string[];
}

// ============================================================
// Interactive loop (pure reducer + thin I/O shell)
// ============================================================

export type WorkTypeKey = "job" | "internship" | "oss" | "freelance";

/** Editing state. The reducer is total and never throws. */
export interface ScopeState {
  fields: ScopeField[];
  work_types: WorkTypeSelection;
  status: "editing" | "confirmed" | "aborted";
  /** Last acknowledgement or rejection, for the shell to print. */
  notice: string | null;
}

/**
 * An action the reducer applies. `add_field` arrives with its backing already
 * computed (the shell looks it up against the in-memory inventory), keeping the
 * reducer pure.
 */
export type ScopeAction =
  | { kind: "toggle_field"; name: string }
  | { kind: "add_field"; name: string; evidence_backed: boolean; supporting_evidence_ids: string[] }
  | { kind: "toggle_work_type"; key: WorkTypeKey }
  | { kind: "confirm" }
  | { kind: "abort" };

/**
 * A parsed operator input line. `add` is not yet an action — the shell resolves
 * the term's evidence backing before dispatching.
 */
export type ScopeCommand =
  | { kind: "toggle_field"; name: string }
  | { kind: "add"; term: string }
  | { kind: "toggle_work_type"; key: WorkTypeKey }
  | { kind: "confirm" }
  | { kind: "abort" }
  | { kind: "help" };
