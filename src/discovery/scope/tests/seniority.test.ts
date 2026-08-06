// seniority.test.ts
// File: src/discovery/scope/tests/seniority.test.ts
// Purpose: The seniority dimension's data and derivations.
//
// The term-list assertions here are deliberately LITERAL rather than
// property-based. These strings feed an unconditional, pre-scoring gate, so a
// silent edit to one of them changes what discovery deletes. A literal
// assertion makes that edit show up as a failing test and a reviewed diff.

import { describe, expect, it } from "vitest";
import { termPresent } from "../../prerank/text";
import {
  ALL_SENIORITY_TERMS,
  ENTRY_LEVEL_MODIFIER,
  SENIORITY_LEVELS,
  SENIORITY_LEVEL_IDS,
  entryLevelModifier,
  seniorityLevel,
  seniorityNegativeTerms,
} from "../seniority";
import type { SeniorityPreference } from "../types";

function preference(excluded: string[], modifier = false): SeniorityPreference {
  return {
    levels: SENIORITY_LEVELS.map((level) => ({
      level: level.id,
      excluded: excluded.includes(level.id),
      terms: [...level.terms],
    })),
    entry_level_query_modifier: modifier,
  };
}

describe("SENIORITY_LEVELS", () => {
  it("is the closed five-level set, in a stable order", () => {
    expect(SENIORITY_LEVEL_IDS).toEqual(["senior", "staff", "principal", "lead", "management"]);
  });

  it("expands each level to exactly these terms", () => {
    const byId = Object.fromEntries(SENIORITY_LEVELS.map((l) => [l.id, l.terms]));
    expect(byId).toEqual({
      senior: ["senior", "sr.", "sr engineer"],
      staff: ["staff engineer", "staff software engineer"],
      principal: ["principal engineer", "principal software engineer"],
      lead: ["tech lead", "technical lead", "team lead", "lead engineer", "engineering lead"],
      management: [
        "engineering manager",
        "director of engineering",
        "head of engineering",
        "vp of engineering",
        "cto",
      ],
    });
  });

  it("never proposes a bare level word that carries a non-seniority meaning", () => {
    // Each of these was rejected for a specific reason recorded in seniority.ts.
    // A future session adding one back has to delete this test to do it.
    for (const banned of ["sr", "staff", "lead", "principal", "manager", "director"]) {
      expect(ALL_SENIORITY_TERMS).not.toContain(banned);
    }
  });

  it("stores every term lowercase and whitespace-normalized", () => {
    for (const term of ALL_SENIORITY_TERMS) {
      expect(term).toBe(term.toLowerCase().replace(/\s+/g, " ").trim());
    }
  });

  it("resolves a level by id and returns null for an unknown one", () => {
    expect(seniorityLevel("lead")?.terms).toContain("tech lead");
    expect(seniorityLevel("architect")).toBeNull();
  });
});

// These guards are about the CONSUMER's matching rule, not this module's data.
// They exist because the terms are only correct relative to how prerank matches
// them, and that rule lives in a file this wave is forbidden to touch.
describe("term safety against prerank's real matcher", () => {
  it('"sr." does not match sre or srv — the regex escape makes the dot literal', () => {
    expect(termPresent("sre platform team", "sr.")).toBe(false);
    expect(termPresent("srv record configuration", "sr.")).toBe(false);
    expect(termPresent("sr. software engineer", "sr.")).toBe(true);
  });

  it('bare "sr" WOULD have matched sr-iov — which is why it is not a term', () => {
    // "-" is a boundary character in prerank's matcher, and SR-IOV is live
    // vocabulary in the Networking and Infra fields.
    expect(termPresent("hands-on with sr-iov and dpdk", "sr")).toBe(true);
    for (const term of ALL_SENIORITY_TERMS) {
      expect(termPresent("hands-on with sr-iov and dpdk", term)).toBe(false);
    }
  });

  it("matches contiguously, so the two staff phrases do not imply each other", () => {
    expect(termPresent("staff software engineer", "staff engineer")).toBe(false);
    expect(termPresent("staff software engineer", "staff software engineer")).toBe(true);
  });

  it("does not match across a hyphen", () => {
    // Documented consequence, not an accident: hyphenated title forms are not
    // covered. See docs/known-issues.md #23.
    expect(termPresent("staff-engineer role", "staff engineer")).toBe(false);
  });

  it("gates on BODY prose, not only titles — the wave's central caveat", () => {
    expect(termPresent("you will partner with senior engineers", "senior")).toBe(true);
    expect(termPresent("you will report to the engineering manager", "engineering manager")).toBe(true);
  });
});

describe("seniorityNegativeTerms", () => {
  it("is empty when nothing is excluded", () => {
    expect(seniorityNegativeTerms(preference([]))).toEqual([]);
  });

  it("emits only the excluded levels' terms", () => {
    expect(seniorityNegativeTerms(preference(["senior"]))).toEqual(["senior", "sr.", "sr engineer"]);
  });

  it("orders by config level order regardless of the file's order", () => {
    const shuffled = preference(["senior", "management"]);
    shuffled.levels.reverse();
    expect(seniorityNegativeTerms(shuffled)).toEqual([
      "senior",
      "sr.",
      "sr engineer",
      "engineering manager",
      "director of engineering",
      "head of engineering",
      "vp of engineering",
      "cto",
    ]);
  });

  it("reads the PERSISTED terms, not the config expansion", () => {
    // The whole point of persisting terms: a config change must not alter what
    // the operator confirmed.
    const pinned = preference(["senior"]);
    pinned.levels[0].terms = ["senior"];
    expect(seniorityNegativeTerms(pinned)).toEqual(["senior"]);
  });

  it("normalizes and dedupes", () => {
    const messy = preference(["senior"]);
    messy.levels[0].terms = ["  Senior ", "senior", "SR  ENGINEER", ""];
    expect(seniorityNegativeTerms(messy)).toEqual(["senior", "sr engineer"]);
  });

  it("ignores a level that is missing from the file's list", () => {
    const partial = preference(["senior"]);
    partial.levels = partial.levels.filter((l) => l.level !== "senior");
    expect(seniorityNegativeTerms(partial)).toEqual([]);
  });
});

describe("entryLevelModifier", () => {
  it("is null unless the operator confirmed it", () => {
    expect(entryLevelModifier(preference([]))).toBeNull();
    expect(entryLevelModifier(preference(["senior"]))).toBeNull();
  });

  it("is independent of the exclusion ticks", () => {
    expect(entryLevelModifier(preference([], true))).toBe(ENTRY_LEVEL_MODIFIER);
    expect(entryLevelModifier(preference(["senior", "staff"], true))).toBe("entry level");
  });
});
