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

// ── Seniority (v2) ──────────────────────────────────────────────────────────

/**
 * The closed set of seniority levels the operator may exclude. Closed by
 * design: unlike `fields`, there is no `add` path. An operator-authored
 * exclusion term would be an unreviewed entry in an unconditional,
 * pre-scoring gate — see {@link SeniorityLevelSelection}.
 */
export type SeniorityLevelId = "senior" | "staff" | "principal" | "lead" | "management";

/**
 * One level's confirmed exclusion state, WITH the expanded literal terms that
 * exclusion means.
 *
 * ── Why the terms are persisted and not merely expanded from config ──────────
 * `ScopeField` persists only a label ("Kubernetes") and lets config expand it,
 * because that expansion drives a POSITIVE signal: its worst case is matching
 * more of what the operator wanted. Seniority expands a NEGATIVE, unconditional
 * gate that runs BEFORE scoring, so its worst case is silently deleting
 * opportunities the operator never sees. A term-list edit is therefore a scope
 * change, and D15 requires scope changes to be re-confirmed — which is only
 * possible if the file records what was actually confirmed.
 *
 * Consequence, by design: config may GAIN terms freely (new terms surface as
 * available and are adopted only by an explicit operator action). Config
 * REMOVING a term invalidates every file that persisted it, loudly. That is
 * correct — a session removing a term owes the operator a migration.
 */
export interface SeniorityLevelSelection {
  level: SeniorityLevelId;
  /** True ⇒ prerank hard-gates any item whose text carries this level's terms. */
  excluded: boolean;
  /**
   * The expanded literal terms, exactly as confirmed. Every entry must be a
   * member of the union of all {@link SeniorityLevelId} term lists in config;
   * the validator rejects anything else, naming the path and the term.
   */
  terms: string[];
}

/** The confirmed seniority dimension. */
export interface SeniorityPreference {
  /** Every {@link SeniorityLevelId} exactly once. Order is not significant. */
  levels: SeniorityLevelSelection[];
  /**
   * Append an entry-level modifier to query_net query strings (himalayas,
   * freehire, adzuna).
   *
   * DELIBERATELY INDEPENDENT of `levels`: "I exclude senior roles" filters what
   * came back, while this rewrites what third-party APIs are asked for and can
   * collapse a result set to zero. Two consequences, two confirmations.
   */
  entry_level_query_modifier: boolean;
}

// ── Geo eligibility (v3) ────────────────────────────────────────────────────

/**
 * The operator's geographic eligibility — SOURCE-AGNOSTIC by ruling (G1
 * Amendment B): this records where the OPERATOR can be hired from; per-source
 * adapters in src/discovery/geo/ map each source's own vocabulary onto it.
 *
 * Eligibility is decided by MEMBERSHIP TESTS ONLY, never length heuristics
 * (the Hostaway finding, track1-geo.md §1d: a 148-country list that is exactly
 * "EMEA" excludes India — "long list" must never be read as "effectively
 * worldwide").
 */
export interface GeoPreference {
  /**
   * ISO-3166 alpha-2, UPPERCASE, deduped. Must be non-empty when the section
   * is active — an active geo section with no eligible country would gate
   * everything, so the reducer refuses `done` on it.
   */
  eligible_countries: string[];
  /**
   * Whether explicitly-unrestricted postings (Himalayas' empty
   * `locationRestrictions`, Remotive's "Worldwide", freehire's
   * `regions:["global"]`) count as eligible.
   */
  worldwide_ok: boolean;
  /**
   * Policy when a mapper RAN and could not parse the value: "pass" keeps the
   * item (surfaced as geo_unresolved), "gate" drops it (reported).
   *
   * This flag does NOT govern `unknown_source` — a source with no mapper at
   * all. That class ALWAYS passes, reported separately (operator ruling Q2,
   * 2026-08-06): under "gate", activating any unmapped source would silently
   * gate 100% of it, and the OSS-program sources are grants/mentorships where
   * country-of-residence eligibility does not apply as it does to employment.
   */
  unresolved: "pass" | "gate";
}

// ── Role types (v3 — SCHEMA ONLY; the gate is deliberately NOT built) ───────

/**
 * The closed set of role types the operator may exclude. Closed like
 * seniority's levels (no `add` path — an operator-authored exclusion term
 * would be an unreviewed entry in a future unconditional gate), but UNLIKE
 * seniority the persisted file is NOT required to carry every id — see
 * {@link RoleTypeSelection} for why that asymmetry is deliberate.
 */
export type RoleTypeId =
  | "account_executive"
  | "sales_development"
  | "marketing"
  | "customer_success"
  | "recruiting"
  | "solutions_engineering"
  | "partner_engineering";

/**
 * One role type's confirmed exclusion state, with the expanded TITLE-scoped
 * terms that exclusion will mean once the gate exists. Terms are persisted for
 * the same reason seniority's are (negative, unconditional intent — see
 * {@link SeniorityLevelSelection}).
 *
 * ── THE COMPLETENESS ASYMMETRY WITH SENIORITY IS DELIBERATE — do not "fix" it
 * in either direction (operator ruling Q4, 2026-08-06). Seniority requires
 * every config level present because a missing level would be an UNSTATED
 * gate decision on a closed 5-level set confirmed complete in one wave.
 * role_types is designed for config GROWTH across waves: for an exclusion
 * gate, ABSENCE of an id can only mean "never confirmed, therefore never
 * gated" — the fail-open, behaviour-neutral default. So config gaining a new
 * id leaves every existing v3 file VALID (no forced re-confirmation); the new
 * id surfaces as <NEW> at the next `oaos setup-scope` and is adopted only by
 * an explicit toggle. What stays strict: unknown ids, duplicate ids,
 * non-member terms, and excluded-with-no-terms all reject loudly.
 */
export interface RoleTypeSelection {
  id: RoleTypeId;
  /**
   * Exclusion INTENT. As of v3 no gate consumes this — the schema ships ahead
   * of the mechanism (ruling Q4) so a later gate build needs no version bump.
   */
  excluded: boolean;
  /** The expanded title-scoped terms, exactly as confirmed. Members of this
   *  id's config term list only. Non-empty whenever `excluded` is true. */
  terms: string[];
}

/** The persisted discovery scope — single source of truth for what we search for. */
export interface Preferences {
  /** 1 → 2: seniority. 2 → 3: geo eligibility + role_types schema. An older
   *  file is REJECTED with an actionable message, never upgraded. */
  version: 3;
  /** ISO-8601 — when the field map was derived. */
  generated_at: string;
  /** ISO-8601 — set only after explicit operator confirmation. */
  confirmed_at: string;
  fields: ScopeField[];
  work_types: WorkTypeSelection;
  /** Locked literal `true` in v1 — remote-only is a charter decision. */
  remote_only: true;
  seniority: SeniorityPreference;
  /**
   * Null ⇔ the operator explicitly confirmed `geo off`: the dimension is
   * confirmed-absent, the filter is disabled, and discovery behaves exactly
   * as v2 did. A DECISION, not a default — the reducer refuses `done` while
   * the geo section is active but has no eligible country.
   */
  geo: GeoPreference | null;
  /** Q4: schema ships now (all-unexcluded ⇒ behaviour-neutral); the gate
   *  ships in a later wave without a version bump. */
  role_types: RoleTypeSelection[];
}

/**
 * A previously-saved scope read ONLY to seed the editing baseline — never to
 * drive discovery.
 *
 * This type exists because the version bump would otherwise break the remedy it
 * prescribes: `setup-scope` reads the existing file to carry the operator's
 * ticks forward, so a strictly-rejecting read would make the one command that
 * fixes a v1 file the one command that cannot open it.
 *
 * The split is: BASELINE READS are version-tolerant, SCOPE CONSUMPTION is not.
 * Unforgeability is preserved because this is deliberately NOT a
 * {@link Preferences} — a tolerated v1 file still cannot become a persisted
 * scope without passing through the reducer and a confirmed `buildPreferences`.
 */
export interface ScopeBaseline {
  /** The file's actual version, as read. */
  version: number;
  fields: ScopeField[];
  work_types: WorkTypeSelection;
  /** Null when the file predates the seniority dimension (v1). */
  seniority: SeniorityPreference | null;
  /**
   * Tri-state: `undefined` when the file predates v3 (no geo decision exists
   * to carry), `null` when a v3 file confirmed `geo off`, a GeoPreference
   * when one was confirmed. The generator proposes fresh only for `undefined`.
   */
  geo?: GeoPreference | null;
  /** Undefined when the file predates v3. */
  role_types?: RoleTypeSelection[];
}

// ============================================================
// Derivation (pure)
// ============================================================

/** Everything {@link deriveScope} needs. No paths, no I/O — the caller loads. */
export interface ScopeInputs {
  resume: BaseResume;
  profile: OperatorProfile;
  inventory: Evidence[];
  /**
   * An existing saved scope, when re-running. Becomes the tick baseline.
   * Typed as {@link ScopeBaseline} so a v1 file can seed a re-confirmation;
   * a {@link Preferences} is structurally assignable and still works.
   */
  existing?: ScopeBaseline;
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
  seniority: SeniorityProposal;
  /** Fresh derivation: empty countries / worldwide on / unresolved "pass",
   *  untouched. Baseline v3: carried forward, touched. */
  geo: GeoSectionState;
  /** Every config id, baseline exclusions/terms carried, all-unexcluded fresh. */
  role_types: RoleTypeState[];
}

/**
 * One level as the operator edits it. Carries both the terms confirmed so far
 * and the config terms not yet adopted — the second axis of the `newly_backed`
 * pattern: surfaced, never auto-applied, operator ticks always win.
 */
export interface SeniorityLevelState {
  level: SeniorityLevelId;
  excluded: boolean;
  /** Carried from the baseline, or the full config list on a fresh derivation. */
  terms: string[];
  /**
   * Config terms this level offers that `terms` does not carry yet. Rendered as
   * `<NEW TERMS>` and moved into `terms` ONLY by an explicit `adopt` action.
   * Never persisted — {@link buildPreferences} stamps `terms` alone.
   */
  available: string[];
}

/** The seniority dimension as proposed and as edited. */
export interface SeniorityProposal {
  levels: SeniorityLevelState[];
  entry_level_query_modifier: boolean;
}

/**
 * The geo section as the operator edits it. `off` mirrors the persisted
 * `geo: null` (dimension confirmed-absent). `touched` is presentation state —
 * the `<NEW IN v3>` marker clears once the operator issues any geo command —
 * and is never persisted.
 */
export interface GeoSectionState {
  countries: string[];
  worldwide_ok: boolean;
  unresolved: "pass" | "gate";
  off: boolean;
  touched: boolean;
}

/**
 * One role type as the operator edits it. `available` mirrors seniority's
 * config-gained-terms pattern; a config-gained ID appears as a fresh
 * unexcluded entry (see RoleTypeSelection on why that is safe).
 */
export interface RoleTypeState {
  id: RoleTypeId;
  excluded: boolean;
  terms: string[];
  /** Config terms not yet adopted. Never persisted. */
  available: string[];
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
  seniority: SeniorityProposal;
  geo: GeoSectionState;
  role_types: RoleTypeState[];
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
  /** `level` is a plain string so an unknown id is a notice, not a throw. */
  | { kind: "toggle_seniority"; level: string }
  | { kind: "adopt_seniority_terms"; level: string }
  | { kind: "toggle_entry_modifier" }
  /** `code` is a raw operator string; the reducer validates the ISO shape. */
  | { kind: "geo_add_country"; code: string }
  | { kind: "geo_remove_country"; code: string }
  | { kind: "geo_set_worldwide"; on: boolean }
  | { kind: "geo_set_unresolved"; policy: "pass" | "gate" }
  /** `off: true` confirms the dimension absent; `off: false` re-activates it. */
  | { kind: "geo_set_off"; off: boolean }
  /** `id` is a plain string so an unknown id is a notice, not a throw. */
  | { kind: "toggle_role_type"; id: string }
  | { kind: "adopt_role_type_terms"; id: string }
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
  | { kind: "toggle_seniority"; level: string }
  | { kind: "adopt_seniority_terms"; level: string }
  | { kind: "toggle_entry_modifier" }
  | { kind: "geo_add_country"; code: string }
  | { kind: "geo_remove_country"; code: string }
  | { kind: "geo_set_worldwide"; on: boolean }
  | { kind: "geo_set_unresolved"; policy: "pass" | "gate" }
  | { kind: "geo_set_off"; off: boolean }
  | { kind: "toggle_role_type"; id: string }
  | { kind: "adopt_role_type_terms"; id: string }
  | { kind: "confirm" }
  | { kind: "abort" }
  | { kind: "help" };
