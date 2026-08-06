// role-types.ts
// File: src/discovery/scope/role-types.ts
// Purpose: The role-type dimension's config data and derivations. 100% pure.
//          v3 ships the SCHEMA ONLY (operator ruling Q4, 2026-08-06): the
//          exclusion gate is deliberately NOT built this wave, so nothing
//          consumes an exclusion yet. The config exists so the operator can
//          record intent now and a later gate build needs no version bump.
//
// ── Term semantics: TITLE-scoped, unlike seniority ──────────────────────────
// Seniority's terms feed prerank's whole-text negative gate (known-issues #23
// documents how blunt that is). Role-type terms are designed for a FUTURE
// TITLE-scoped gate — matching a posting's title only — because role-type
// words are hopeless against whole text ("sales team", "work with marketing")
// but unambiguous in a title ("Account Executive", "Field Marketing Manager").
// Measured evidence: track3-roletype.md (2026-08-06). When the gate is built,
// it must match titles ONLY; wiring these terms into
// `PrerankVocabulary.negativeTerms` would repeat #23 at far worse odds.
//
// Term-list philosophy follows seniority.ts: narrow lists, bare ambiguous
// words rejected. Bare "sales" is REJECTED (title "Sales Engineer" overlaps
// solutions_engineering; "Pre-Sales" compounds vary). Bare "solutions" is
// REJECTED ("Solutions Architect" was one of only two India-eligible
// near-engineering titles in the 2026-08-06 corpus — the operator curates
// that boundary explicitly, config does not assume it).

import type { RoleTypeId, RoleTypeSelection } from "./types";

/** One role type as config proposes it. */
export interface RoleTypeDefinition {
  id: RoleTypeId;
  /** Shown in `oaos setup-scope`. */
  label: string;
  /** Title-scoped term expansion the operator confirms. */
  terms: string[];
}

/**
 * The closed role-type set. Config may GAIN ids across waves without
 * invalidating existing v3 files (see types.ts RoleTypeSelection — the
 * completeness asymmetry with seniority is deliberate and ruled). Config
 * REMOVING an id or a term invalidates files that persisted it, loudly,
 * by design.
 */
export const ROLE_TYPES: readonly RoleTypeDefinition[] = [
  {
    id: "account_executive",
    label: "account executive",
    terms: ["account executive"],
  },
  {
    id: "sales_development",
    label: "sales development",
    terms: ["sales development representative", "sales development"],
  },
  {
    id: "marketing",
    label: "marketing",
    // Title-scoped, so the bare word is safe in a way it never would be in
    // body text: an engineering title does not contain "marketing".
    terms: ["marketing"],
  },
  {
    id: "customer_success",
    label: "customer success",
    terms: ["customer success"],
  },
  {
    id: "recruiting",
    label: "recruiting",
    terms: ["recruiter", "recruiting", "talent acquisition"],
  },
  {
    id: "solutions_engineering",
    label: "solutions engineering",
    // "solutions architect" deliberately NOT proposed — see header.
    terms: ["solutions engineer", "solutions engineering"],
  },
  {
    id: "partner_engineering",
    label: "partner engineering",
    terms: ["partner sales engineer", "partner solutions engineer", "partner se"],
  },
];

/** Every role-type id, in config order. */
export const ROLE_TYPE_IDS: readonly RoleTypeId[] = ROLE_TYPES.map((t) => t.id);

/** Look up a role-type definition by id. Null for an unknown id. */
export function roleType(id: string): RoleTypeDefinition | null {
  return ROLE_TYPES.find((t) => t.id === id) ?? null;
}

/**
 * The confirmed exclusion terms a future title-scoped gate would consume.
 * Reads PERSISTED terms only (the seniority rule: a later config edit must
 * not change behaviour behind the operator's back). Exported now so the gate
 * build has one obvious seam; NOTHING calls this in v3.
 */
export function roleTypeExclusionTerms(selections: RoleTypeSelection[]): string[] {
  const byId = new Map(selections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ROLE_TYPE_IDS) {
    const selection = byId.get(id);
    if (!selection || !selection.excluded) continue;
    for (const raw of selection.terms) {
      const term = raw.toLowerCase().replace(/\s+/g, " ").trim();
      if (term === "" || seen.has(term)) continue;
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}
