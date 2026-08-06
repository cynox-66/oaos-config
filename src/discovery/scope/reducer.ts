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
import type {
  Preferences,
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

/** Seed editing state from a derived proposal. Nothing is confirmed yet. */
export function initialState(proposal: ScopeProposal): ScopeState {
  return {
    fields: proposal.fields.map((f) => ({ ...f, supporting_evidence_ids: [...f.supporting_evidence_ids] })),
    work_types: { ...proposal.work_types },
    seniority: copySeniority(proposal.seniority),
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

    case "confirm":
      return { ...state, status: "confirmed", notice: null };

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
  };
}
