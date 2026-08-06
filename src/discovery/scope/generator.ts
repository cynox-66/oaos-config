// generator.ts
// File: src/discovery/scope/generator.ts
// Purpose: Derive a PROPOSED discovery field map from the operator's real
//          profile artifacts. 100% pure — no I/O, no network, no LLM. The
//          generator proposes; the operator disposes (D15). Nothing here
//          confirms anything: the output is a proposal, never a Preferences.
//
// Matching philosophy: exact normalized equality, no fuzzy matching (the
// established contact-lookup precedent). "network" does NOT match "Networking";
// "eBPF/LSM concepts" does NOT match "eBPF". Under-proposing is the correct
// failure mode — the operator ticks what we missed, whereas a substring rule
// would silently widen discovery scope, which D15 forbids.

import { PROPOSED_WORK_TYPES, SCOPE_VOCABULARY } from "./config";
import { SENIORITY_LEVELS } from "./seniority";
import { ROLE_TYPES } from "./role-types";
import type {
  Evidence,
  FieldBacking,
  GeoSectionState,
  RoleTypeState,
  ScopeBaseline,
  ScopeDeps,
  ScopeField,
  ScopeInputs,
  ScopeProposal,
  SeniorityProposal,
  WorkTypeSelection,
} from "./types";

/**
 * Canonical comparison form: lowercased, trimmed, and any run of hyphens,
 * underscores, or whitespace collapsed to a single space. "/" is preserved so
 * "Web/Frontend" and "AI/ML" match literally.
 */
export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim().replace(/[-_\s]+/g, " ");
}

/**
 * Evidence backing for one term: every inventory asset whose `domains[]` or
 * `tech_tags[]` contains an exact normalized match. Ids come back in inventory
 * order, deduped. Pure.
 */
export function computeBacking(term: string, inventory: Evidence[]): FieldBacking {
  const key = normalizeTerm(term);
  const ids: string[] = [];
  for (const asset of inventory) {
    const labels = [...(asset.domains ?? []), ...(asset.tech_tags ?? [])];
    if (labels.some((label) => normalizeTerm(label) === key) && !ids.includes(asset.id)) {
      ids.push(asset.id);
    }
  }
  return { evidence_backed: ids.length > 0, supporting_evidence_ids: ids };
}

/**
 * The operator's self-declared skill surface: resume skills, project tech tags,
 * and profile stack. A match here means "the operator studies/works in this" —
 * enough to pre-tick, but NOT enough to claim evidence backing.
 */
function profileTerms(inputs: ScopeInputs): Set<string> {
  const raw = [
    ...inputs.resume.skills,
    ...inputs.resume.projects.flatMap((p) => p.tech_tags),
    ...inputs.profile.stack,
  ];
  return new Set(raw.map(normalizeTerm));
}

/** Carry the operator's confirmed tick state forward across a re-run. */
function baselineTicks(existing: ScopeBaseline | undefined): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const field of existing?.fields ?? []) {
    map.set(normalizeTerm(field.name), field.enabled);
  }
  return map;
}

/** Which fields were evidence-backed at the time of the last confirmation. */
function baselineBacking(existing: ScopeBaseline | undefined): Set<string> {
  const set = new Set<string>();
  for (const field of existing?.fields ?? []) {
    if (field.evidence_backed) set.add(normalizeTerm(field.name));
  }
  return set;
}

/**
 * Build one field, recomputing backing from the CURRENT inventory. `aspirational`
 * follows the D15 formula; it is never carried over from a stale file.
 */
function buildField(
  name: string,
  origin: ScopeField["origin"],
  enabled: boolean,
  backing: FieldBacking
): ScopeField {
  return {
    name,
    origin,
    evidence_backed: backing.evidence_backed,
    aspirational: origin === "operator_added" && !backing.evidence_backed,
    enabled,
    supporting_evidence_ids: backing.supporting_evidence_ids,
  };
}

/**
 * Propose the seniority dimension.
 *
 * Fresh derivation: every level present, NOTHING excluded, modifier off, and
 * the full config term expansion carried as `terms`. Under-proposing is policy
 * here for a sharper reason than elsewhere in this module — a negative term is
 * an unconditional pre-scoring gate, so a wrong pre-tick silently deletes
 * opportunities the operator never sees, while a missed tick costs one
 * keystroke. It also makes the v1 migration behaviour-neutral: an operator who
 * re-confirms without touching this section gets exactly today's discovery.
 *
 * Re-run over a v2 baseline: the operator's exclusions, modifier, and confirmed
 * TERMS all carry forward. Config terms the baseline does not carry surface as
 * `available` — the second axis of the `newly_backed` pattern: shown, never
 * auto-applied, adopted only by an explicit action. A term-list edit is a scope
 * change, and D15 requires the operator to confirm scope changes.
 *
 * Re-run over a v1 baseline (`seniority === null`): proposed fresh.
 */
function deriveSeniority(existing: ScopeBaseline | undefined): SeniorityProposal {
  const prior = existing?.seniority ?? null;

  const levels = SENIORITY_LEVELS.map((definition) => {
    const carried = prior?.levels.find((l) => l.level === definition.id) ?? null;
    const terms = carried ? [...carried.terms] : [...definition.terms];
    return {
      level: definition.id,
      excluded: carried ? carried.excluded : false,
      terms,
      available: definition.terms.filter((term) => !terms.includes(term)),
    };
  });

  return { levels, entry_level_query_modifier: prior?.entry_level_query_modifier ?? false };
}

/**
 * Propose the geo section.
 *
 * Fresh derivation (and any pre-v3 baseline): EMPTY country list, worldwide
 * on, unresolved "pass", untouched. Nothing is inferred — not even from the
 * operator's profile — because geo eligibility is a legal/personal fact only
 * the operator can assert (G1 ruling). The reducer refuses `done` while the
 * section is active and empty, so the empty proposal cannot leak into a file.
 *
 * v3 baseline: the confirmed state carries forward — including a confirmed
 * `geo off` (baseline.geo === null) — and the section counts as touched.
 */
function deriveGeo(existing: ScopeBaseline | undefined): GeoSectionState {
  const prior = existing?.geo;
  if (prior === undefined) {
    return { countries: [], worldwide_ok: true, unresolved: "pass", off: false, touched: false };
  }
  if (prior === null) {
    return { countries: [], worldwide_ok: true, unresolved: "pass", off: true, touched: true };
  }
  return {
    countries: [...prior.eligible_countries],
    worldwide_ok: prior.worldwide_ok,
    unresolved: prior.unresolved,
    off: false,
    touched: true,
  };
}

/**
 * Propose the role-type section: every config id, nothing excluded fresh,
 * baseline exclusions/terms carried forward. A config id the baseline does
 * not carry appears as a fresh unexcluded entry — the ruled Q4 tolerance
 * (see types.ts RoleTypeSelection): absence means never-confirmed-therefore-
 * never-gated, so a config-gained id never invalidates an existing file.
 */
function deriveRoleTypes(existing: ScopeBaseline | undefined): RoleTypeState[] {
  const prior = existing?.role_types;
  return ROLE_TYPES.map((definition) => {
    const carried = prior?.find((t) => t.id === definition.id) ?? null;
    const terms = carried ? [...carried.terms] : [...definition.terms];
    return {
      id: definition.id,
      excluded: carried ? carried.excluded : false,
      terms,
      available: definition.terms.filter((term) => !terms.includes(term)),
    };
  });
}

/**
 * Derive the proposed field map.
 *
 * Proposal rule: a vocabulary field is pre-ticked iff it is evidence-backed OR
 * matched by the resume/profile. Everything else in the vocabulary is listed but
 * pre-unticked, so the operator can see and tick it.
 *
 * On a re-run (`inputs.existing`), the operator's ticks are the baseline instead
 * of the fresh proposal — we never silently re-tick something they unticked —
 * while evidence backing is always recomputed from the current inventory.
 * Operator-added custom fields are carried forward in their original order.
 *
 * Deterministic: identical inputs and `deps.now` produce a deep-equal proposal.
 */
export function deriveScope(inputs: ScopeInputs, deps: ScopeDeps): ScopeProposal {
  const profile = profileTerms(inputs);
  const ticks = baselineTicks(inputs.existing);
  const wasBacked = baselineBacking(inputs.existing);
  const newly_backed: string[] = [];

  const emit = (name: string, origin: ScopeField["origin"], proposedTick: boolean): ScopeField => {
    const key = normalizeTerm(name);
    const backing = computeBacking(name, inputs.inventory);
    if (backing.evidence_backed && inputs.existing && !wasBacked.has(key)) {
      newly_backed.push(name);
    }
    // A carried-forward tick always wins over the fresh proposal.
    const enabled = ticks.has(key) ? (ticks.get(key) as boolean) : proposedTick;
    return buildField(name, origin, enabled, backing);
  };

  const fields: ScopeField[] = [];

  // 1. The controlled vocabulary, in Engine 1's own order.
  for (const term of SCOPE_VOCABULARY) {
    const backing = computeBacking(term, inputs.inventory);
    const proposedTick = backing.evidence_backed || profile.has(normalizeTerm(term));
    fields.push(emit(term, "derived", proposedTick));
  }

  // 2. Operator-added custom terms from a previous run, in their original order.
  const vocabKeys = new Set(SCOPE_VOCABULARY.map(normalizeTerm));
  for (const prior of inputs.existing?.fields ?? []) {
    if (vocabKeys.has(normalizeTerm(prior.name))) continue;
    fields.push(emit(prior.name, "operator_added", prior.enabled));
  }

  // Work types: a re-run shows the operator's current selection as the baseline;
  // a fresh run proposes the Phase 1 scope. `freelance` is locked false in both.
  const work_types: WorkTypeSelection = inputs.existing
    ? { ...inputs.existing.work_types, freelance: false }
    : { ...PROPOSED_WORK_TYPES };

  return {
    generated_at: deps.now,
    fields,
    work_types,
    newly_backed,
    seniority: deriveSeniority(inputs.existing),
    geo: deriveGeo(inputs.existing),
    role_types: deriveRoleTypes(inputs.existing),
  };
}
