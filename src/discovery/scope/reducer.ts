// reducer.ts
// File: src/discovery/scope/reducer.ts
// Purpose: The interactive setup loop as a PURE state machine. `reduceScope` is
//          total (never throws) and never mutates its input; the CLI shell is a
//          thin read-line → parse → dispatch → render wrapper around it, so the
//          whole decision surface is unit-testable without a TTY.
//
// The freelance lock lives HERE as well as in the validator: the reducer refuses
// the toggle outright, so the locked literal cannot even be reached through the
// UI, let alone persisted.

import { PREFERENCES_VERSION } from "./config";
import { SENIORITY_LEVEL_IDS } from "./seniority";
import { ROLE_TYPE_IDS } from "./role-types";
import type {
  GeoSectionState,
  Preferences,
  RoleTypeState,
  ScopeAction,
  ScopeCommand,
  ScopeField,
  ScopeProposal,
  ScopeState,
  SeniorityProposal,
  WorkTypeKey,
} from "./types";

const WORK_TYPE_KEYS: WorkTypeKey[] = ["job", "internship", "oss", "freelance"];

function key(name: string): string {
  return name.toLowerCase().trim();
}

/** Deep copy of the seniority section, so no action ever mutates its input. */
function copySeniority(seniority: SeniorityProposal): SeniorityProposal {
  return {
    levels: seniority.levels.map((l) => ({ ...l, terms: [...l.terms], available: [...l.available] })),
    entry_level_query_modifier: seniority.entry_level_query_modifier,
  };
}

/** Deep copies, so no action ever mutates its input. */
function copyGeo(geo: GeoSectionState): GeoSectionState {
  return { ...geo, countries: [...geo.countries] };
}

function copyRoleTypes(types: RoleTypeState[]): RoleTypeState[] {
  return types.map((t) => ({ ...t, terms: [...t.terms], available: [...t.available] }));
}

/** Seed editing state from a derived proposal. Nothing is confirmed yet. */
export function initialState(proposal: ScopeProposal): ScopeState {
  return {
    fields: proposal.fields.map((f) => ({ ...f, supporting_evidence_ids: [...f.supporting_evidence_ids] })),
    work_types: { ...proposal.work_types },
    seniority: copySeniority(proposal.seniority),
    geo: copyGeo(proposal.geo),
    role_types: copyRoleTypes(proposal.role_types),
    status: "editing",
    notice: null,
  };
}

/**
 * Apply one action. Pure, total, non-mutating. An action that cannot apply
 * returns the state unchanged with an explanatory `notice` — the loop never
 * dead-ends and never silently ignores input.
 */
export function reduceScope(state: ScopeState, action: ScopeAction): ScopeState {
  if (state.status !== "editing") return state;

  switch (action.kind) {
    case "toggle_field": {
      const target = key(action.name);
      const index = state.fields.findIndex((f) => key(f.name) === target);
      if (index === -1) {
        return { ...state, notice: `No such field: "${action.name}"` };
      }
      const field = state.fields[index];
      const toggled: ScopeField = { ...field, enabled: !field.enabled };
      const fields = [...state.fields];
      fields[index] = toggled;
      return {
        ...state,
        fields,
        notice: `${toggled.enabled ? "Ticked" : "Unticked"} ${field.name}`,
      };
    }

    case "add_field": {
      const name = action.name.trim();
      if (name === "") {
        return { ...state, notice: "A field name is required" };
      }
      const existing = state.fields.find((f) => key(f.name) === key(name));
      if (existing) {
        return {
          ...state,
          notice: `"${existing.name}" is already in the list — tick it by its number instead`,
        };
      }
      const field: ScopeField = {
        name,
        origin: "operator_added",
        evidence_backed: action.evidence_backed,
        // D15: operator-added with no supporting evidence is aspirational —
        // flagged for honest Match-score presentation, but searched identically.
        aspirational: !action.evidence_backed,
        enabled: true,
        supporting_evidence_ids: [...action.supporting_evidence_ids],
      };
      return {
        ...state,
        fields: [...state.fields, field],
        notice: action.evidence_backed
          ? `Added ${name} — backed by ${action.supporting_evidence_ids.length} evidence asset(s)`
          : `Added ${name} — aspirational (no supporting evidence yet)`,
      };
    }

    case "toggle_work_type": {
      if (action.key === "freelance") {
        return {
          ...state,
          notice:
            "freelance is locked off in v1 — freelance discovery is deferred by locked decision",
        };
      }
      const work_types = { ...state.work_types, [action.key]: !state.work_types[action.key] };
      return {
        ...state,
        work_types,
        notice: `${action.key}: ${work_types[action.key] ? "on" : "off"}`,
      };
    }

    case "toggle_seniority": {
      const index = state.seniority.levels.findIndex((l) => l.level === key(action.level));
      if (index === -1) {
        return { ...state, notice: `No such seniority level: "${action.level}"` };
      }
      const seniority = copySeniority(state.seniority);
      const level = seniority.levels[index];
      level.excluded = !level.excluded;
      return {
        ...state,
        seniority,
        notice: level.excluded
          ? `Excluding ${level.level} — gates any posting whose TEXT carries: ${level.terms.join(", ")}`
          : `No longer excluding ${level.level}`,
      };
    }

    case "adopt_seniority_terms": {
      const index = state.seniority.levels.findIndex((l) => l.level === key(action.level));
      if (index === -1) {
        return { ...state, notice: `No such seniority level: "${action.level}"` };
      }
      if (state.seniority.levels[index].available.length === 0) {
        return {
          ...state,
          notice: `${state.seniority.levels[index].level} has no new terms to adopt`,
        };
      }
      const seniority = copySeniority(state.seniority);
      const level = seniority.levels[index];
      const adopted = [...level.available];
      level.terms = [...level.terms, ...adopted];
      level.available = [];
      return {
        ...state,
        seniority,
        notice: `Adopted ${adopted.length} new term(s) for ${level.level}: ${adopted.join(", ")}`,
      };
    }

    case "toggle_entry_modifier": {
      const seniority = copySeniority(state.seniority);
      seniority.entry_level_query_modifier = !seniority.entry_level_query_modifier;
      return {
        ...state,
        seniority,
        notice: seniority.entry_level_query_modifier
          ? "Entry-level query modifier ON — himalayas / freehire / adzuna query strings will narrow"
          : "Entry-level query modifier OFF",
      };
    }

    case "geo_add_country": {
      const code = action.code.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) {
        return {
          ...state,
          notice: `"${action.code}" is not an ISO-3166 alpha-2 country code (two letters, e.g. IN)`,
        };
      }
      if (state.geo.countries.includes(code)) {
        return { ...state, notice: `${code} is already in the eligible list` };
      }
      const geo = copyGeo(state.geo);
      geo.countries = [...geo.countries, code];
      geo.off = false;
      geo.touched = true;
      return { ...state, geo, notice: `Added ${code} to eligible countries` };
    }

    case "geo_remove_country": {
      const code = action.code.trim().toUpperCase();
      if (!state.geo.countries.includes(code)) {
        return { ...state, notice: `${code} is not in the eligible list` };
      }
      const geo = copyGeo(state.geo);
      geo.countries = geo.countries.filter((c) => c !== code);
      geo.touched = true;
      return { ...state, geo, notice: `Removed ${code} from eligible countries` };
    }

    case "geo_set_worldwide": {
      const geo = copyGeo(state.geo);
      geo.worldwide_ok = action.on;
      geo.touched = true;
      return {
        ...state,
        geo,
        notice: action.on
          ? "Worldwide-remote postings count as eligible"
          : "Worldwide-remote postings do NOT count as eligible",
      };
    }

    case "geo_set_unresolved": {
      const geo = copyGeo(state.geo);
      geo.unresolved = action.policy;
      geo.touched = true;
      return {
        ...state,
        geo,
        notice:
          action.policy === "pass"
            ? "Unresolved geo passes the filter (surfaced as geo_unresolved in run summaries)"
            : "Unresolved geo is gated (dropped and reported) — unparseable postings will not be seen",
      };
    }

    case "geo_set_off": {
      const geo = copyGeo(state.geo);
      geo.off = action.off;
      geo.touched = true;
      return {
        ...state,
        geo,
        notice: action.off
          ? "Geo filtering OFF — discovery will behave exactly as it did before v3"
          : "Geo filtering back ON — add eligible countries before confirming",
      };
    }

    case "toggle_role_type": {
      const index = state.role_types.findIndex((t) => t.id === key(action.id));
      if (index === -1) {
        return { ...state, notice: `No such role type: "${action.id}"` };
      }
      const role_types = copyRoleTypes(state.role_types);
      const type = role_types[index];
      type.excluded = !type.excluded;
      return {
        ...state,
        role_types,
        notice: type.excluded
          ? `Excluding ${type.id} — recorded as intent; the title-scoped gate is not built yet (v3 ships the schema only)`
          : `No longer excluding ${type.id}`,
      };
    }

    case "adopt_role_type_terms": {
      const index = state.role_types.findIndex((t) => t.id === key(action.id));
      if (index === -1) {
        return { ...state, notice: `No such role type: "${action.id}"` };
      }
      if (state.role_types[index].available.length === 0) {
        return { ...state, notice: `${state.role_types[index].id} has no new terms to adopt` };
      }
      const role_types = copyRoleTypes(state.role_types);
      const type = role_types[index];
      const adopted = [...type.available];
      type.terms = [...type.terms, ...adopted];
      type.available = [];
      return {
        ...state,
        role_types,
        notice: `Adopted ${adopted.length} new term(s) for ${type.id}: ${adopted.join(", ")}`,
      };
    }

    case "confirm": {
      // The geo section cannot be confirmed active-but-empty: that scope would
      // gate every posting. "Keep the pre-v3 behaviour" is one explicit
      // command (`geo off`), never a default (D15).
      if (!state.geo.off && state.geo.countries.length === 0) {
        return {
          ...state,
          notice:
            "The geo section is new in v3 — add your eligible countries (`geo add IN`) " +
            "or explicitly disable geo filtering (`geo off`) before `done`.",
        };
      }
      return { ...state, status: "confirmed", notice: null };
    }

    case "abort":
      return { ...state, status: "aborted", notice: null };
  }
}

/**
 * Parse one operator input line into a command. Pure. Returns null for anything
 * unrecognized so the shell can print the help hint.
 *
 * Accepted: a field's 1-based number (toggle), `add <term>`, a work-type name,
 * `s<n>` (toggle a seniority level), `adopt s<n>`, `entry`, `done`/`confirm`,
 * `quit`/`abort`/`q`, `help`/`?`.
 *
 * Seniority uses its own `s<n>` namespace so plain field numbers keep meaning
 * exactly what they meant before this dimension existed — nothing renumbers.
 */
export function parseScopeCommand(line: string, state: ScopeState): ScopeCommand | null {
  const input = line.trim();
  if (input === "") return null;
  const lower = input.toLowerCase();

  if (lower === "help" || lower === "?") return { kind: "help" };
  if (lower === "done" || lower === "confirm") return { kind: "confirm" };
  if (lower === "quit" || lower === "abort" || lower === "q") return { kind: "abort" };
  if (lower === "entry") return { kind: "toggle_entry_modifier" };

  const geo = /^geo\s+(.+)$/i.exec(input);
  if (geo) {
    const rest = geo[1].trim().toLowerCase();
    if (rest === "off") return { kind: "geo_set_off", off: true };
    if (rest === "on") return { kind: "geo_set_off", off: false };
    const add = /^add\s+(\S+)$/.exec(rest);
    if (add) return { kind: "geo_add_country", code: add[1].toUpperCase() };
    const remove = /^remove\s+(\S+)$/.exec(rest);
    if (remove) return { kind: "geo_remove_country", code: remove[1].toUpperCase() };
    const worldwide = /^worldwide\s+(on|off)$/.exec(rest);
    if (worldwide) return { kind: "geo_set_worldwide", on: worldwide[1] === "on" };
    const unresolved = /^unresolved\s+(pass|gate)$/.exec(rest);
    if (unresolved) return { kind: "geo_set_unresolved", policy: unresolved[1] as "pass" | "gate" };
    return null;
  }

  const adoptRt = /^adopt\s+rt(\d+)$/i.exec(input);
  if (adoptRt) {
    const id = roleTypeAt(Number(adoptRt[1]));
    return id === null ? null : { kind: "adopt_role_type_terms", id };
  }

  const rt = /^rt(\d+)$/i.exec(input);
  if (rt) {
    const id = roleTypeAt(Number(rt[1]));
    return id === null ? null : { kind: "toggle_role_type", id };
  }

  const adopt = /^adopt\s+s(\d+)$/i.exec(input);
  if (adopt) {
    const level = seniorityLevelAt(state, Number(adopt[1]));
    return level === null ? null : { kind: "adopt_seniority_terms", level };
  }

  const seniority = /^s(\d+)$/i.exec(input);
  if (seniority) {
    const level = seniorityLevelAt(state, Number(seniority[1]));
    return level === null ? null : { kind: "toggle_seniority", level };
  }

  if (/^\d+$/.test(input)) {
    const index = Number(input) - 1;
    if (index < 0 || index >= state.fields.length) return null;
    return { kind: "toggle_field", name: state.fields[index].name };
  }

  const add = /^add\s+(.+)$/i.exec(input);
  if (add) return { kind: "add", term: add[1].trim() };

  if ((WORK_TYPE_KEYS as string[]).includes(lower)) {
    return { kind: "toggle_work_type", key: lower as WorkTypeKey };
  }

  return null;
}

/** The 1-based seniority level id at `n`, or null when out of range. */
function seniorityLevelAt(state: ScopeState, n: number): string | null {
  const index = n - 1;
  if (index < 0 || index >= state.seniority.levels.length) return null;
  return state.seniority.levels[index].level;
}

/** The 1-based role-type id at `n` (config order), or null when out of range. */
function roleTypeAt(n: number): string | null {
  const index = n - 1;
  if (index < 0 || index >= ROLE_TYPE_IDS.length) return null;
  return ROLE_TYPE_IDS[index];
}

/**
 * Assemble the persisted {@link Preferences} from a CONFIRMED state. Throws if
 * the state was not confirmed — `confirmed_at` may only ever be stamped by an
 * explicit operator confirmation, so this is the one guarded constructor.
 *
 * This is also the sole stamper of the seniority dimension. The expanded TERMS
 * are persisted, not just the level ticks: they drive an unconditional
 * pre-scoring gate, so what the operator confirmed has to be recoverable from
 * the file rather than re-derived from whatever config says later. `available`
 * is dropped — an unadopted term was, by definition, not confirmed.
 */
export function buildPreferences(
  state: ScopeState,
  stamps: { generated_at: string; confirmed_at: string }
): Preferences {
  if (state.status !== "confirmed") {
    throw new Error(
      `buildPreferences: refusing to build from status="${state.status}" — scope must be confirmed`
    );
  }
  const known = new Set<string>(SENIORITY_LEVEL_IDS);
  const unknown = state.seniority.levels.filter((l) => !known.has(l.level));
  if (unknown.length > 0) {
    throw new Error(
      `buildPreferences: unknown seniority level(s) ${unknown.map((l) => l.level).join(", ")}`
    );
  }
  if (!state.geo.off && state.geo.countries.length === 0) {
    // Unreachable through the reducer (confirm refuses this state); guarded
    // here too because this is the sole constructor of the persisted type.
    throw new Error(
      "buildPreferences: geo section is active but has no eligible countries"
    );
  }

  return {
    version: PREFERENCES_VERSION,
    generated_at: stamps.generated_at,
    confirmed_at: stamps.confirmed_at,
    fields: state.fields.map((f) => ({ ...f, supporting_evidence_ids: [...f.supporting_evidence_ids] })),
    work_types: { ...state.work_types, freelance: false },
    remote_only: true,
    seniority: {
      levels: state.seniority.levels.map((l) => ({
        level: l.level,
        excluded: l.excluded,
        terms: [...l.terms],
      })),
      entry_level_query_modifier: state.seniority.entry_level_query_modifier,
    },
    geo: state.geo.off
      ? null
      : {
          eligible_countries: [...state.geo.countries],
          worldwide_ok: state.geo.worldwide_ok,
          unresolved: state.geo.unresolved,
        },
    role_types: state.role_types.map((t) => ({
      id: t.id,
      excluded: t.excluded,
      terms: [...t.terms],
    })),
  };
}
