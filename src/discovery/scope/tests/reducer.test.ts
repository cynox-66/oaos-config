// reducer.test.ts
// File: src/discovery/scope/tests/reducer.test.ts
// Purpose: The interactive loop's decision surface, tested without a TTY. If a
//          behaviour matters to the operator, it lives in the reducer and is
//          asserted here; the CLI shell only reads lines and prints.

import { describe, expect, it } from "vitest";
import {
  buildPreferences,
  initialState,
  parseScopeCommand,
  reduceScope,
} from "../reducer";
import { SENIORITY_LEVELS } from "../seniority";
import type { ScopeProposal, ScopeState } from "../types";

const proposal: ScopeProposal = {
  generated_at: "2026-07-20T12:00:00.000Z",
  newly_backed: [],
  work_types: { job: true, internship: true, oss: true, freelance: false },
  fields: [
    {
      name: "Security",
      origin: "derived",
      evidence_backed: true,
      aspirational: false,
      enabled: true,
      supporting_evidence_ids: ["sec-1"],
    },
    {
      name: "Data",
      origin: "derived",
      evidence_backed: false,
      aspirational: false,
      enabled: false,
      supporting_evidence_ids: [],
    },
  ],
  seniority: {
    levels: SENIORITY_LEVELS.map((level) => ({
      level: level.id,
      excluded: false,
      terms: [...level.terms],
      available: [],
    })),
    entry_level_query_modifier: false,
  },
};

const fresh = (): ScopeState => initialState(proposal);
const field = (s: ScopeState, name: string) => s.fields.find((f) => f.name === name)!;

describe("initialState", () => {
  it("starts editing, unconfirmed, with no notice", () => {
    expect(fresh()).toMatchObject({ status: "editing", notice: null });
  });

  it("copies the proposal rather than aliasing it", () => {
    const state = reduceScope(fresh(), { kind: "toggle_field", name: "Security" });
    expect(field(state, "Security").enabled).toBe(false);
    expect(proposal.fields[0].enabled).toBe(true); // proposal untouched
  });
});

describe("reduceScope — fields", () => {
  it("toggles a field off and back on", () => {
    const off = reduceScope(fresh(), { kind: "toggle_field", name: "Security" });
    expect(field(off, "Security").enabled).toBe(false);
    expect(off.notice).toContain("Unticked Security");

    const on = reduceScope(off, { kind: "toggle_field", name: "Security" });
    expect(field(on, "Security").enabled).toBe(true);
    expect(on.notice).toContain("Ticked Security");
  });

  it("matches a field name case-insensitively", () => {
    const state = reduceScope(fresh(), { kind: "toggle_field", name: "security" });
    expect(field(state, "Security").enabled).toBe(false);
  });

  it("notices an unknown field instead of throwing", () => {
    const state = reduceScope(fresh(), { kind: "toggle_field", name: "nope" });
    expect(state.fields).toEqual(fresh().fields);
    expect(state.notice).toContain('No such field: "nope"');
  });

  it("does not mutate the input state", () => {
    const before = fresh();
    const snapshot = JSON.parse(JSON.stringify(before));
    reduceScope(before, { kind: "toggle_field", name: "Security" });
    expect(before).toEqual(snapshot);
  });
});

describe("reduceScope — operator-added fields (D15)", () => {
  it("adds an unbacked term as aspirational, enabled, and searched identically", () => {
    const state = reduceScope(fresh(), {
      kind: "add_field",
      name: "wasm",
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
    expect(field(state, "wasm")).toEqual({
      name: "wasm",
      origin: "operator_added",
      evidence_backed: false,
      aspirational: true,
      enabled: true,
      supporting_evidence_ids: [],
    });
    expect(state.notice).toContain("aspirational");
  });

  it("adds a backed term as operator_added but NOT aspirational", () => {
    const state = reduceScope(fresh(), {
      kind: "add_field",
      name: "wasm",
      evidence_backed: true,
      supporting_evidence_ids: ["w-1"],
    });
    expect(field(state, "wasm")).toMatchObject({
      origin: "operator_added",
      evidence_backed: true,
      aspirational: false,
      supporting_evidence_ids: ["w-1"],
    });
  });

  it("refuses a duplicate and points at the existing entry", () => {
    const state = reduceScope(fresh(), {
      kind: "add_field",
      name: "security",
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
    expect(state.fields).toHaveLength(2);
    expect(state.notice).toContain("already in the list");
  });

  it("refuses an empty term", () => {
    const state = reduceScope(fresh(), {
      kind: "add_field",
      name: "   ",
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
    expect(state.fields).toHaveLength(2);
    expect(state.notice).toContain("required");
  });
});

describe("reduceScope — work types", () => {
  it("toggles job / internship / oss", () => {
    const state = reduceScope(fresh(), { kind: "toggle_work_type", key: "internship" });
    expect(state.work_types.internship).toBe(false);
    expect(state.notice).toBe("internship: off");
  });

  it("REFUSES to toggle freelance — the lock is unreachable through the UI", () => {
    const state = reduceScope(fresh(), { kind: "toggle_work_type", key: "freelance" });
    expect(state.work_types.freelance).toBe(false);
    expect(state.notice).toContain("locked off in v1");
  });
});

describe("reduceScope — terminal states", () => {
  it("confirms and then ignores further actions", () => {
    const confirmed = reduceScope(fresh(), { kind: "confirm" });
    expect(confirmed.status).toBe("confirmed");
    expect(reduceScope(confirmed, { kind: "toggle_field", name: "Security" })).toBe(confirmed);
  });

  it("aborts and then ignores further actions", () => {
    const aborted = reduceScope(fresh(), { kind: "abort" });
    expect(aborted.status).toBe("aborted");
    expect(reduceScope(aborted, { kind: "confirm" })).toBe(aborted);
  });
});

describe("parseScopeCommand", () => {
  const state = fresh();

  it("maps a 1-based number to that field", () => {
    expect(parseScopeCommand("1", state)).toEqual({ kind: "toggle_field", name: "Security" });
    expect(parseScopeCommand(" 2 ", state)).toEqual({ kind: "toggle_field", name: "Data" });
  });

  it("rejects an out-of-range or zero index", () => {
    expect(parseScopeCommand("0", state)).toBeNull();
    expect(parseScopeCommand("3", state)).toBeNull();
  });

  it("parses add with a multi-word term", () => {
    expect(parseScopeCommand("add  service mesh ", state)).toEqual({
      kind: "add",
      term: "service mesh",
    });
  });

  it("parses work-type names, including the locked one", () => {
    expect(parseScopeCommand("oss", state)).toEqual({ kind: "toggle_work_type", key: "oss" });
    // Parsed, then refused by the reducer — the refusal is explained, not silent.
    expect(parseScopeCommand("freelance", state)).toEqual({
      kind: "toggle_work_type",
      key: "freelance",
    });
  });

  it("parses the terminal and help words case-insensitively", () => {
    expect(parseScopeCommand("DONE", state)).toEqual({ kind: "confirm" });
    expect(parseScopeCommand("confirm", state)).toEqual({ kind: "confirm" });
    expect(parseScopeCommand("q", state)).toEqual({ kind: "abort" });
    expect(parseScopeCommand("quit", state)).toEqual({ kind: "abort" });
    expect(parseScopeCommand("?", state)).toEqual({ kind: "help" });
  });

  it("returns null for blank or unrecognized input", () => {
    expect(parseScopeCommand("   ", state)).toBeNull();
    expect(parseScopeCommand("delete everything", state)).toBeNull();
  });
});

describe("buildPreferences", () => {
  it("refuses to build from an unconfirmed state", () => {
    expect(() => buildPreferences(fresh(), { generated_at: "a", confirmed_at: "b" })).toThrow(
      /must be confirmed/
    );
    expect(() =>
      buildPreferences(reduceScope(fresh(), { kind: "abort" }), {
        generated_at: "a",
        confirmed_at: "b",
      })
    ).toThrow(/must be confirmed/);
  });

  it("stamps both timestamps and the locked literals on confirm", () => {
    const confirmed = reduceScope(fresh(), { kind: "confirm" });
    const prefs = buildPreferences(confirmed, {
      generated_at: "2026-07-20T12:00:00.000Z",
      confirmed_at: "2026-07-20T12:05:00.000Z",
    });
    expect(prefs).toMatchObject({
      version: 2,
      generated_at: "2026-07-20T12:00:00.000Z",
      confirmed_at: "2026-07-20T12:05:00.000Z",
      remote_only: true,
      work_types: { freelance: false },
    });
  });
});

describe("seniority actions", () => {
  const level = (s: ScopeState, id: string) => s.seniority.levels.find((l) => l.level === id)!;

  it("toggles a level on and back off", () => {
    const on = reduceScope(fresh(), { kind: "toggle_seniority", level: "senior" });
    expect(level(on, "senior").excluded).toBe(true);
    const off = reduceScope(on, { kind: "toggle_seniority", level: "senior" });
    expect(level(off, "senior").excluded).toBe(false);
  });

  it("names the terms in the notice, so the operator sees what a tick means", () => {
    const on = reduceScope(fresh(), { kind: "toggle_seniority", level: "senior" });
    expect(on.notice).toContain("senior, sr., sr engineer");
    expect(on.notice).toContain("TEXT");
  });

  it("leaves the other levels and the fields untouched", () => {
    const on = reduceScope(fresh(), { kind: "toggle_seniority", level: "lead" });
    expect(level(on, "senior").excluded).toBe(false);
    expect(on.fields).toEqual(fresh().fields);
  });

  it("does not mutate its input", () => {
    const before = fresh();
    reduceScope(before, { kind: "toggle_seniority", level: "senior" });
    expect(level(before, "senior").excluded).toBe(false);
  });

  it("returns state unchanged with a notice for an unknown level", () => {
    const state = reduceScope(fresh(), { kind: "toggle_seniority", level: "architect" });
    expect(state.seniority).toEqual(fresh().seniority);
    expect(state.notice).toContain("No such seniority level");
  });

  it("toggles the entry-level query modifier independently of the exclusions", () => {
    const on = reduceScope(fresh(), { kind: "toggle_entry_modifier" });
    expect(on.seniority.entry_level_query_modifier).toBe(true);
    expect(on.seniority.levels.every((l) => !l.excluded)).toBe(true);
    expect(reduceScope(on, { kind: "toggle_entry_modifier" }).seniority.entry_level_query_modifier).toBe(
      false
    );
  });

  it("adopts a level's available terms only when asked", () => {
    let state = fresh();
    state.seniority.levels[0] = {
      ...state.seniority.levels[0],
      terms: ["senior"],
      available: ["sr.", "sr engineer"],
    };
    const adopted = reduceScope(state, { kind: "adopt_seniority_terms", level: "senior" });
    expect(level(adopted, "senior").terms).toEqual(["senior", "sr.", "sr engineer"]);
    expect(level(adopted, "senior").available).toEqual([]);
    expect(adopted.notice).toContain("Adopted 2 new term(s)");
  });

  it("notices, rather than throwing, when there is nothing to adopt", () => {
    const state = reduceScope(fresh(), { kind: "adopt_seniority_terms", level: "senior" });
    expect(state.notice).toContain("no new terms to adopt");
    expect(state.seniority).toEqual(fresh().seniority);
  });
});

describe("buildPreferences — seniority", () => {
  it("stamps the confirmed exclusions, terms and modifier", () => {
    let state = reduceScope(fresh(), { kind: "toggle_seniority", level: "senior" });
    state = reduceScope(state, { kind: "toggle_entry_modifier" });
    state = reduceScope(state, { kind: "confirm" });
    const prefs = buildPreferences(state, { generated_at: "a", confirmed_at: "b" });

    expect(prefs.seniority.entry_level_query_modifier).toBe(true);
    expect(prefs.seniority.levels.find((l) => l.level === "senior")).toEqual({
      level: "senior",
      excluded: true,
      terms: ["senior", "sr.", "sr engineer"],
    });
  });

  it("drops `available` — an unadopted term was never confirmed", () => {
    let state = fresh();
    state.seniority.levels[0] = {
      ...state.seniority.levels[0],
      terms: ["senior"],
      available: ["sr.", "sr engineer"],
    };
    state = reduceScope(state, { kind: "confirm" });
    const prefs = buildPreferences(state, { generated_at: "a", confirmed_at: "b" });
    expect(prefs.seniority.levels[0]).not.toHaveProperty("available");
    expect(prefs.seniority.levels[0].terms).toEqual(["senior"]);
  });

  it("still refuses to build from an unconfirmed state", () => {
    const state = reduceScope(fresh(), { kind: "toggle_seniority", level: "senior" });
    expect(() => buildPreferences(state, { generated_at: "a", confirmed_at: "b" })).toThrow(
      /must be confirmed/
    );
  });
});

describe("parseScopeCommand — seniority", () => {
  it("parses s<n> to the level at that position", () => {
    expect(parseScopeCommand("s1", fresh())).toEqual({ kind: "toggle_seniority", level: "senior" });
    expect(parseScopeCommand("s5", fresh())).toEqual({
      kind: "toggle_seniority",
      level: "management",
    });
  });

  it("parses `adopt s<n>`", () => {
    expect(parseScopeCommand("adopt s4", fresh())).toEqual({
      kind: "adopt_seniority_terms",
      level: "lead",
    });
  });

  it("parses `entry`", () => {
    expect(parseScopeCommand("entry", fresh())).toEqual({ kind: "toggle_entry_modifier" });
  });

  it("rejects an out-of-range level number", () => {
    expect(parseScopeCommand("s9", fresh())).toBeNull();
    expect(parseScopeCommand("s0", fresh())).toBeNull();
  });

  it("leaves plain field numbers meaning exactly what they meant before", () => {
    expect(parseScopeCommand("1", fresh())).toEqual({ kind: "toggle_field", name: "Security" });
  });

  it("does not mistake `adopt s1` for an `add` command", () => {
    expect(parseScopeCommand("adopt s1", fresh())).not.toMatchObject({ kind: "add" });
  });
});
