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
import type {
  Preferences,
  ScopeAction,
  ScopeCommand,
  ScopeField,
  ScopeProposal,
  ScopeState,
  WorkTypeKey,
} from "./types";

const WORK_TYPE_KEYS: WorkTypeKey[] = ["job", "internship", "oss", "freelance"];

function key(name: string): string {
  return name.toLowerCase().trim();
}

/** Seed editing state from a derived proposal. Nothing is confirmed yet. */
export function initialState(proposal: ScopeProposal): ScopeState {
  return {
    fields: proposal.fields.map((f) => ({ ...f, supporting_evidence_ids: [...f.supporting_evidence_ids] })),
    work_types: { ...proposal.work_types },
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
 * `done`/`confirm`, `quit`/`abort`/`q`, `help`/`?`.
 */
export function parseScopeCommand(line: string, state: ScopeState): ScopeCommand | null {
  const input = line.trim();
  if (input === "") return null;
  const lower = input.toLowerCase();

  if (lower === "help" || lower === "?") return { kind: "help" };
  if (lower === "done" || lower === "confirm") return { kind: "confirm" };
  if (lower === "quit" || lower === "abort" || lower === "q") return { kind: "abort" };

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

/**
 * Assemble the persisted {@link Preferences} from a CONFIRMED state. Throws if
 * the state was not confirmed — `confirmed_at` may only ever be stamped by an
 * explicit operator confirmation, so this is the one guarded constructor.
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
  return {
    version: PREFERENCES_VERSION,
    generated_at: stamps.generated_at,
    confirmed_at: stamps.confirmed_at,
    fields: state.fields.map((f) => ({ ...f, supporting_evidence_ids: [...f.supporting_evidence_ids] })),
    work_types: { ...state.work_types, freelance: false },
    remote_only: true,
  };
}
