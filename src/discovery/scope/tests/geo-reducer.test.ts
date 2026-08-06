// geo-reducer.test.ts
// File: src/discovery/scope/tests/geo-reducer.test.ts
// Purpose: The geo and role-type sections of the interactive loop — commands,
//          actions, the active-but-empty confirm refusal, unforgeability, and
//          baseline carry-forward (including the ruled config-gains-an-id
//          tolerance).

import { describe, expect, it } from "vitest";
import { buildPreferences, initialState, parseScopeCommand, reduceScope } from "../reducer";
import { deriveScope } from "../generator";
import { SENIORITY_LEVELS } from "../seniority";
import { ROLE_TYPES } from "../role-types";
import type { ScopeAction, ScopeBaseline, ScopeProposal, ScopeState } from "../types";

function proposal(over: Partial<ScopeProposal> = {}): ScopeProposal {
  return {
    generated_at: "2026-08-06T12:00:00.000Z",
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
    geo: { countries: [], worldwide_ok: true, unresolved: "pass", off: false, touched: false },
    role_types: ROLE_TYPES.map((t) => ({
      id: t.id,
      excluded: false,
      terms: [...t.terms],
      available: [],
    })),
    ...over,
  };
}

const fresh = (): ScopeState => initialState(proposal());
const apply = (state: ScopeState, ...actions: ScopeAction[]): ScopeState =>
  actions.reduce(reduceScope, state);

// ============================================================
// geo actions
// ============================================================

describe("geo actions", () => {
  it("adds a country, uppercasing and marking the section touched", () => {
    const state = apply(fresh(), { kind: "geo_add_country", code: "in" });
    expect(state.geo.countries).toEqual(["IN"]);
    expect(state.geo.touched).toBe(true);
    expect(state.notice).toContain("Added IN");
  });

  it("rejects a non-ISO shape with a notice, not a throw", () => {
    const state = apply(fresh(), { kind: "geo_add_country", code: "India" });
    expect(state.geo.countries).toEqual([]);
    expect(state.notice).toContain("not an ISO-3166 alpha-2 country code");
  });

  it("refuses a duplicate add with a notice", () => {
    const state = apply(
      fresh(),
      { kind: "geo_add_country", code: "IN" },
      { kind: "geo_add_country", code: "in" }
    );
    expect(state.geo.countries).toEqual(["IN"]);
    expect(state.notice).toContain("already");
  });

  it("removes a country; removing an absent one is a notice", () => {
    const added = apply(fresh(), { kind: "geo_add_country", code: "IN" });
    const removed = reduceScope(added, { kind: "geo_remove_country", code: "in" });
    expect(removed.geo.countries).toEqual([]);
    const noop = reduceScope(removed, { kind: "geo_remove_country", code: "US" });
    expect(noop.notice).toContain("not in the eligible list");
  });

  it("sets worldwide and unresolved, and both mark the section touched", () => {
    const state = apply(
      fresh(),
      { kind: "geo_set_worldwide", on: false },
      { kind: "geo_set_unresolved", policy: "gate" }
    );
    expect(state.geo.worldwide_ok).toBe(false);
    expect(state.geo.unresolved).toBe("gate");
    expect(state.geo.touched).toBe(true);
  });

  it("geo off / geo on round-trips", () => {
    const off = apply(fresh(), { kind: "geo_set_off", off: true });
    expect(off.geo.off).toBe(true);
    expect(off.notice).toContain("behave exactly as it did before v3");
    const on = reduceScope(off, { kind: "geo_set_off", off: false });
    expect(on.geo.off).toBe(false);
  });

  it("adding a country re-activates a switched-off section", () => {
    const state = apply(
      fresh(),
      { kind: "geo_set_off", off: true },
      { kind: "geo_add_country", code: "IN" }
    );
    expect(state.geo.off).toBe(false);
    expect(state.geo.countries).toEqual(["IN"]);
  });

  it("never mutates its input", () => {
    const before = fresh();
    reduceScope(before, { kind: "geo_add_country", code: "IN" });
    expect(before.geo.countries).toEqual([]);
  });
});

// ============================================================
// confirm refusal
// ============================================================

describe("confirm refusal on active-but-empty geo", () => {
  it("refuses `done` while the geo section is active and empty, naming both exits", () => {
    const state = reduceScope(fresh(), { kind: "confirm" });
    expect(state.status).toBe("editing");
    expect(state.notice).toContain("geo add IN");
    expect(state.notice).toContain("geo off");
  });

  it("confirms after a country is added", () => {
    const state = apply(fresh(), { kind: "geo_add_country", code: "IN" }, { kind: "confirm" });
    expect(state.status).toBe("confirmed");
  });

  it("confirms after an explicit geo off", () => {
    const state = apply(fresh(), { kind: "geo_set_off", off: true }, { kind: "confirm" });
    expect(state.status).toBe("confirmed");
  });
});

// ============================================================
// role-type actions
// ============================================================

describe("role-type actions", () => {
  it("toggles an exclusion, saying the gate is not built yet", () => {
    const state = apply(fresh(), { kind: "toggle_role_type", id: "account_executive" });
    expect(state.role_types.find((t) => t.id === "account_executive")!.excluded).toBe(true);
    expect(state.notice).toContain("gate is not built yet");
  });

  it("an unknown id is a notice, not a throw", () => {
    const state = apply(fresh(), { kind: "toggle_role_type", id: "sales" });
    expect(state.notice).toContain('No such role type: "sales"');
  });

  it("adopts available terms exactly like seniority's adopt", () => {
    const withAvailable = initialState(
      proposal({
        role_types: ROLE_TYPES.map((t) => ({
          id: t.id,
          excluded: false,
          terms: t.terms.slice(0, 1),
          available: t.terms.slice(1),
        })),
      })
    );
    const target = ROLE_TYPES.find((t) => t.terms.length > 1)!;
    const state = reduceScope(withAvailable, { kind: "adopt_role_type_terms", id: target.id });
    const adopted = state.role_types.find((t) => t.id === target.id)!;
    expect(adopted.terms).toEqual([...target.terms]);
    expect(adopted.available).toEqual([]);
  });
});

// ============================================================
// command parsing
// ============================================================

describe("parseScopeCommand — geo and rt namespaces", () => {
  const state = fresh();

  it("parses every geo command form", () => {
    expect(parseScopeCommand("geo add IN", state)).toEqual({ kind: "geo_add_country", code: "IN" });
    expect(parseScopeCommand("geo remove in", state)).toEqual({ kind: "geo_remove_country", code: "IN" });
    expect(parseScopeCommand("geo worldwide off", state)).toEqual({ kind: "geo_set_worldwide", on: false });
    expect(parseScopeCommand("geo unresolved gate", state)).toEqual({
      kind: "geo_set_unresolved",
      policy: "gate",
    });
    expect(parseScopeCommand("geo off", state)).toEqual({ kind: "geo_set_off", off: true });
    expect(parseScopeCommand("geo on", state)).toEqual({ kind: "geo_set_off", off: false });
  });

  it("returns null for a malformed geo command", () => {
    expect(parseScopeCommand("geo", state)).toBeNull();
    expect(parseScopeCommand("geo add", state)).toBeNull();
    expect(parseScopeCommand("geo unresolved maybe", state)).toBeNull();
  });

  it("parses rt<n> and adopt rt<n> against config order", () => {
    expect(parseScopeCommand("rt1", state)).toEqual({
      kind: "toggle_role_type",
      id: ROLE_TYPES[0].id,
    });
    expect(parseScopeCommand(`adopt rt${ROLE_TYPES.length}`, state)).toEqual({
      kind: "adopt_role_type_terms",
      id: ROLE_TYPES[ROLE_TYPES.length - 1].id,
    });
    expect(parseScopeCommand(`rt${ROLE_TYPES.length + 1}`, state)).toBeNull();
    expect(parseScopeCommand("rt0", state)).toBeNull();
  });

  it("does not disturb the existing namespaces", () => {
    expect(parseScopeCommand("s1", state)).toMatchObject({ kind: "toggle_seniority" });
    expect(parseScopeCommand("1", state)).toMatchObject({ kind: "toggle_field" });
  });
});

// ============================================================
// buildPreferences — stamping + unforgeability
// ============================================================

describe("buildPreferences — geo and role_types stamping", () => {
  it("stamps an active geo section", () => {
    const state = apply(fresh(), { kind: "geo_add_country", code: "IN" }, { kind: "confirm" });
    const prefs = buildPreferences(state, {
      generated_at: "2026-08-06T12:00:00.000Z",
      confirmed_at: "2026-08-06T12:05:00.000Z",
    });
    expect(prefs.version).toBe(3);
    expect(prefs.geo).toEqual({ eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" });
    expect(prefs.role_types.map((t) => t.excluded)).not.toContain(true);
  });

  it("stamps a confirmed geo off as null", () => {
    const state = apply(fresh(), { kind: "geo_set_off", off: true }, { kind: "confirm" });
    const prefs = buildPreferences(state, {
      generated_at: "2026-08-06T12:00:00.000Z",
      confirmed_at: "2026-08-06T12:05:00.000Z",
    });
    expect(prefs.geo).toBeNull();
  });

  it("still throws on an unconfirmed state — unforgeability covers the new sections for free", () => {
    const state = apply(fresh(), { kind: "geo_add_country", code: "IN" });
    expect(() =>
      buildPreferences(state, {
        generated_at: "2026-08-06T12:00:00.000Z",
        confirmed_at: "2026-08-06T12:05:00.000Z",
      })
    ).toThrow('status="editing"');
  });
});

// ============================================================
// generator — baseline carry-forward
// ============================================================

describe("deriveScope — geo / role_types baselines", () => {
  const inputs = {
    resume: { name: "n", summary: "s", experience: [], projects: [], education: [], skills: [] },
    profile: { name: "n", github: "g", portfolio_url: "https://x", stack: [] },
    inventory: [],
  };

  function baseline(over: Partial<ScopeBaseline> = {}): ScopeBaseline {
    return {
      version: 3,
      fields: [],
      work_types: { job: true, internship: true, oss: true, freelance: false },
      seniority: {
        levels: SENIORITY_LEVELS.map((l) => ({ level: l.id, excluded: false, terms: [...l.terms] })),
        entry_level_query_modifier: false,
      },
      geo: { eligible_countries: ["IN"], worldwide_ok: false, unresolved: "gate" },
      role_types: [],
      ...over,
    };
  }

  it("fresh derivation proposes an untouched, empty, on geo section", () => {
    const derived = deriveScope(inputs, { now: "2026-08-06T12:00:00.000Z" });
    expect(derived.geo).toEqual({
      countries: [],
      worldwide_ok: true,
      unresolved: "pass",
      off: false,
      touched: false,
    });
    expect(derived.role_types.every((t) => !t.excluded)).toBe(true);
  });

  it("a pre-v3 baseline (geo undefined) proposes fresh — nothing to carry", () => {
    const derived = deriveScope(
      { ...inputs, existing: baseline({ geo: undefined, role_types: undefined }) },
      { now: "2026-08-06T12:00:00.000Z" }
    );
    expect(derived.geo.touched).toBe(false);
    expect(derived.geo.countries).toEqual([]);
  });

  it("a v3 baseline carries the confirmed geo forward, touched", () => {
    const derived = deriveScope(
      { ...inputs, existing: baseline() },
      { now: "2026-08-06T12:00:00.000Z" }
    );
    expect(derived.geo).toEqual({
      countries: ["IN"],
      worldwide_ok: false,
      unresolved: "gate",
      off: false,
      touched: true,
    });
  });

  it("a confirmed geo off carries forward as off", () => {
    const derived = deriveScope(
      { ...inputs, existing: baseline({ geo: null }) },
      { now: "2026-08-06T12:00:00.000Z" }
    );
    expect(derived.geo.off).toBe(true);
    expect(derived.geo.touched).toBe(true);
  });

  it("THE RULED Q4 PROPERTY: a config-gained id surfaces as a fresh unexcluded entry without invalidating anything", () => {
    // Baseline knows only ONE id (as if config gained the rest later).
    const derived = deriveScope(
      {
        ...inputs,
        existing: baseline({
          role_types: [{ id: "marketing", excluded: true, terms: ["marketing"] }],
        }),
      },
      { now: "2026-08-06T12:00:00.000Z" }
    );
    expect(derived.role_types).toHaveLength(ROLE_TYPES.length);
    expect(derived.role_types.find((t) => t.id === "marketing")).toMatchObject({ excluded: true });
    expect(
      derived.role_types.filter((t) => t.id !== "marketing").every((t) => !t.excluded)
    ).toBe(true);
  });

  it("baseline terms carry forward with config-gained terms surfacing as available", () => {
    const target = ROLE_TYPES.find((t) => t.terms.length > 1)!;
    const derived = deriveScope(
      {
        ...inputs,
        existing: baseline({
          role_types: [{ id: target.id, excluded: true, terms: target.terms.slice(0, 1) }],
        }),
      },
      { now: "2026-08-06T12:00:00.000Z" }
    );
    const state = derived.role_types.find((t) => t.id === target.id)!;
    expect(state.terms).toEqual(target.terms.slice(0, 1));
    expect(state.available).toEqual(target.terms.slice(1));
  });
});
