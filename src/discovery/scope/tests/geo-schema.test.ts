// geo-schema.test.ts
// File: src/discovery/scope/tests/geo-schema.test.ts
// Purpose: v3 schema validation — the geo section, the role_types section
//          (including the RULED completeness asymmetry with seniority), and
//          the v2 → v3 migration stop.

import { describe, expect, it } from "vitest";
import { SENIORITY_LEVELS } from "../seniority";
import { ROLE_TYPES } from "../role-types";
import { parseBaseline, parsePreferences, ScopeValidationError } from "../preferences";
import type { Preferences } from "../types";

function valid(): Preferences {
  return {
    version: 3,
    generated_at: "2026-08-06T12:00:00.000Z",
    confirmed_at: "2026-08-06T12:05:00.000Z",
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
    work_types: { job: true, internship: true, oss: true, freelance: false },
    remote_only: true,
    seniority: {
      levels: SENIORITY_LEVELS.map((level) => ({
        level: level.id,
        excluded: false,
        terms: [...level.terms],
      })),
      entry_level_query_modifier: false,
    },
    geo: { eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" },
    role_types: [],
  };
}

function corrupt(mutate: (o: Record<string, unknown>) => void): unknown {
  const o = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
  mutate(o);
  return o;
}

function expectRejection(raw: unknown, fragment: string): void {
  expect(() => parsePreferences(raw)).toThrow(ScopeValidationError);
  expect(() => parsePreferences(raw)).toThrow(fragment);
}

// ============================================================
// geo section
// ============================================================

describe("parsePreferences — geo", () => {
  it("accepts an active geo section", () => {
    expect(parsePreferences(valid()).geo).toEqual({
      eligible_countries: ["IN"],
      worldwide_ok: true,
      unresolved: "pass",
    });
  });

  it("accepts geo: null — a confirmed `geo off`", () => {
    expect(parsePreferences(corrupt((o) => void (o.geo = null))).geo).toBeNull();
  });

  it("rejects a MISSING geo key on a v3 file — absence is not a decision", () => {
    expect(() => parsePreferences(corrupt((o) => void delete o.geo))).toThrow("preferences.geo");
  });

  it("rejects an active section with an empty country list, naming the geo-off alternative", () => {
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).eligible_countries = [])),
      "must not be empty while the geo section is active"
    );
  });

  it("rejects a non-ISO-shaped code, naming it", () => {
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).eligible_countries = ["India"])),
      '"India" is not an ISO-3166 alpha-2 code'
    );
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).eligible_countries = ["in"])),
      'not an ISO-3166 alpha-2 code'
    );
  });

  it("rejects duplicate countries", () => {
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).eligible_countries = ["IN", "IN"])),
      'duplicate country "IN"'
    );
  });

  it("rejects an unknown unresolved policy", () => {
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).unresolved = "maybe")),
      'preferences.geo.unresolved'
    );
  });

  it("rejects a non-boolean worldwide_ok, naming the path", () => {
    expectRejection(
      corrupt((o) => void ((o.geo as Record<string, unknown>).worldwide_ok = "yes")),
      "preferences.geo.worldwide_ok"
    );
  });
});

// ============================================================
// role_types section
// ============================================================

describe("parsePreferences — role_types", () => {
  const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "account_executive",
    excluded: true,
    terms: ["account executive"],
    ...over,
  });

  it("accepts an empty array — nothing confirmed, nothing gated", () => {
    expect(parsePreferences(valid()).role_types).toEqual([]);
  });

  it("accepts a well-formed exclusion", () => {
    const prefs = parsePreferences(corrupt((o) => void (o.role_types = [entry()])));
    expect(prefs.role_types[0]).toEqual({
      id: "account_executive",
      excluded: true,
      terms: ["account executive"],
    });
  });

  it("THE RULED ASYMMETRY: a file missing config ids is VALID (config may gain ids freely)", () => {
    // Unlike seniority ("all 5 levels must be present"), a partial role_types
    // list parses — absence means never-confirmed-therefore-never-gated.
    const partial = corrupt((o) => void (o.role_types = [entry({ excluded: false })]));
    expect(ROLE_TYPES.length).toBeGreaterThan(1);
    expect(() => parsePreferences(partial)).not.toThrow();
  });

  it("rejects an unknown id, naming the closed set", () => {
    expectRejection(
      corrupt((o) => void (o.role_types = [entry({ id: "sales" })])),
      'unknown role type "sales"'
    );
  });

  it("rejects a duplicate id", () => {
    expectRejection(
      corrupt((o) => void (o.role_types = [entry(), entry()])),
      'duplicate role type "account_executive"'
    );
  });

  it("rejects a term outside THAT id's config list — per-id membership, stricter than seniority's union", () => {
    expectRejection(
      corrupt((o) => void (o.role_types = [entry({ terms: ["marketing"] })])),
      '"marketing" is not a known term for role type "account_executive"'
    );
  });

  it("rejects excluded-with-no-terms — an exclusion with no terms is a no-op lie", () => {
    expectRejection(
      corrupt((o) => void (o.role_types = [entry({ terms: [] })])),
      "excluded is true but no terms are confirmed"
    );
  });

  it("accepts unexcluded-with-no-terms (never produced, but not a lie)", () => {
    expect(() =>
      parsePreferences(corrupt((o) => void (o.role_types = [entry({ excluded: false, terms: [] })])))
    ).not.toThrow();
  });
});

// ============================================================
// migration
// ============================================================

describe("v2 → v3 migration stop", () => {
  function v2(): unknown {
    const o = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
    o.version = 2;
    delete o.geo;
    delete o.role_types;
    return o;
  }

  it("rejects a v2 file with the exact ruled message", () => {
    expect(() => parsePreferences(v2())).toThrow(ScopeValidationError);
    expect(() => parsePreferences(v2())).toThrow(
      "is version 2; this build requires version 3 (adds the geo eligibility"
    );
    expect(() => parsePreferences(v2())).toThrow("Run `oaos setup-scope` to re-confirm your scope");
    expect(() => parsePreferences(v2())).toThrow("carried forward");
  });

  it("parseBaseline reads the same v2 file, with geo/role_types undefined (nothing to carry)", () => {
    const baseline = parseBaseline(v2());
    expect(baseline.version).toBe(2);
    expect(baseline.seniority).not.toBeNull();
    expect(baseline.geo).toBeUndefined();
    expect(baseline.role_types).toBeUndefined();
  });

  it("parseBaseline on a v3 file carries geo (including a confirmed null) and role_types", () => {
    const withGeo = parseBaseline(valid());
    expect(withGeo.geo).toEqual({ eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" });
    expect(withGeo.role_types).toEqual([]);

    const offGeo = parseBaseline(corrupt((o) => void (o.geo = null)));
    expect(offGeo.geo).toBeNull();
  });
});
