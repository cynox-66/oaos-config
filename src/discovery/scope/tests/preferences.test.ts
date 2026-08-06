// preferences.test.ts
// File: src/discovery/scope/tests/preferences.test.ts
// Purpose: The strict loader/writer. Every rejection case asserts that the
//          offending PATH is named — a malformed scope must say exactly what is
//          wrong, never be silently coerced into something searchable.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadBaseline,
  loadPreferences,
  parseBaseline,
  parsePreferences,
  ScopeValidationError,
  writePreferences,
} from "../preferences";
import { SENIORITY_LEVELS } from "../seniority";
import type { Preferences } from "../types";

const dir = mkdtempSync(join(tmpdir(), "oaos-scope-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function valid(): Preferences {
  return {
    version: 2,
    generated_at: "2026-07-20T12:00:00.000Z",
    confirmed_at: "2026-07-20T12:05:00.000Z",
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
        name: "wasm",
        origin: "operator_added",
        evidence_backed: false,
        aspirational: true,
        enabled: true,
        supporting_evidence_ids: [],
      },
    ],
    work_types: { job: true, internship: true, oss: true, freelance: false },
    remote_only: true,
    seniority: {
      levels: SENIORITY_LEVELS.map((level) => ({
        level: level.id,
        excluded: level.id === "senior",
        terms: [...level.terms],
      })),
      entry_level_query_modifier: false,
    },
  };
}

/** Mutate a valid object into an invalid one, bypassing the compile-time types
 *  the way a hand edit to the JSON file would. */
function corrupt(mutate: (o: Record<string, unknown>) => void): unknown {
  const o = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
  mutate(o);
  return o;
}

function expectRejection(raw: unknown, pathFragment: string): void {
  expect(() => parsePreferences(raw)).toThrow(ScopeValidationError);
  expect(() => parsePreferences(raw)).toThrow(pathFragment);
}

describe("parsePreferences — acceptance", () => {
  it("accepts a well-formed scope unchanged", () => {
    expect(parsePreferences(valid())).toEqual(valid());
  });

  it("ignores unknown extra keys rather than carrying them through", () => {
    const withExtra = corrupt((o) => {
      o.something_else = "ignored";
    });
    expect(parsePreferences(withExtra)).toEqual(valid());
  });
});

describe("parsePreferences — schema rejection", () => {
  it("rejects a non-object", () => expectRejection([], "preferences: expected object"));

  it("rejects a newer/unknown version", () => {
    expectRejection(corrupt((o) => void (o.version = 3)), "preferences.version: expected 2");
  });

  it.each([
    ["generated_at", "preferences.generated_at"],
    ["confirmed_at", "preferences.confirmed_at"],
    ["fields", "preferences.fields"],
    ["work_types", "preferences.work_types"],
    ["remote_only", "preferences.remote_only"],
  ])("rejects a missing %s, naming its path", (missingKey, path) => {
    expectRejection(corrupt((o) => void delete o[missingKey]), path);
  });

  it("rejects a non-ISO timestamp", () => {
    expectRejection(
      corrupt((o) => void (o.confirmed_at = "last tuesday")),
      "preferences.confirmed_at: not a valid ISO-8601 timestamp"
    );
  });

  it("rejects an unknown field origin", () => {
    expectRejection(
      corrupt((o) => void ((o.fields as Record<string, unknown>[])[0].origin = "guessed")),
      "preferences.fields[0].origin"
    );
  });

  it("rejects a duplicate field name", () => {
    expectRejection(
      corrupt((o) => {
        const fields = o.fields as Record<string, unknown>[];
        fields.push({ ...fields[0], name: "security" });
      }),
      "duplicate field"
    );
  });
});

describe("parsePreferences — invariant rejection (never coerce, reject loudly)", () => {
  it("rejects an inconsistent aspirational flag", () => {
    expectRejection(
      corrupt((o) => void ((o.fields as Record<string, unknown>[])[1].aspirational = false)),
      "preferences.fields[1].aspirational"
    );
  });

  it("rejects a derived field marked aspirational", () => {
    expectRejection(
      corrupt((o) => void ((o.fields as Record<string, unknown>[])[0].aspirational = true)),
      "preferences.fields[0].aspirational"
    );
  });

  it("rejects evidence_backed disagreeing with supporting_evidence_ids", () => {
    expectRejection(
      corrupt((o) => void ((o.fields as Record<string, unknown>[])[0].supporting_evidence_ids = [])),
      "preferences.fields[0].evidence_backed"
    );
  });
});

describe("parsePreferences — locked literals", () => {
  it("rejects freelance: true", () => {
    expectRejection(
      corrupt((o) => void ((o.work_types as Record<string, unknown>).freelance = true)),
      "preferences.work_types.freelance: must be false"
    );
  });

  it("rejects remote_only: false", () => {
    expectRejection(
      corrupt((o) => void (o.remote_only = false)),
      "preferences.remote_only: must be true"
    );
  });
});

describe("loadPreferences / writePreferences", () => {
  it("round-trips: write → read → deep-equal", () => {
    const path = join(dir, "round-trip.json");
    writePreferences(path, valid());
    expect(loadPreferences(path)).toEqual(valid());
  });

  it("names the file when it does not exist", () => {
    const path = join(dir, "absent.json");
    expect(() => loadPreferences(path)).toThrow(ScopeValidationError);
    expect(() => loadPreferences(path)).toThrow(path);
  });

  it("names the file when it is not valid JSON", () => {
    const path = join(dir, "broken.json");
    writeFileSync(path, "{ not json", "utf8");
    expect(() => loadPreferences(path)).toThrow("is not valid JSON");
  });

  it("reports the offending path against the real filename on load", () => {
    const path = join(dir, "bad-lock.json");
    writeFileSync(path, JSON.stringify(corrupt((o) => void (o.remote_only = false))), "utf8");
    expect(() => loadPreferences(path)).toThrow(`${path}.remote_only: must be true`);
  });

  it("validates BEFORE writing, leaving an existing file intact", () => {
    const path = join(dir, "guarded.json");
    writePreferences(path, valid());
    const bad = corrupt((o) => void (o.remote_only = false)) as Preferences;
    expect(() => writePreferences(path, bad)).toThrow(ScopeValidationError);
    expect(loadPreferences(path)).toEqual(valid()); // untouched
  });
});

// ============================================================
// Seniority dimension (v2)
// ============================================================

/** A v1 file: the pre-seniority shape a real operator file has today. */
function v1(): Record<string, unknown> {
  const o = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
  o.version = 1;
  delete o.seniority;
  return o;
}

describe("parseSeniority — schema rejection", () => {
  it("rejects a missing seniority block on a v2 file", () => {
    expectRejection(corrupt((o) => void delete o.seniority), "preferences.seniority: expected object");
  });

  it("rejects an unknown level, naming it and the closed set", () => {
    expectRejection(
      corrupt((o) => {
        (o.seniority as { levels: { level: string }[] }).levels[0].level = "architect";
      }),
      'preferences.seniority.levels[0].level: unknown seniority level "architect"'
    );
  });

  it("rejects a duplicate level", () => {
    expectRejection(
      corrupt((o) => {
        const s = o.seniority as { levels: { level: string }[] };
        s.levels[1].level = s.levels[0].level;
      }),
      "duplicate level"
    );
  });

  it("rejects a missing level — all five must be present", () => {
    expectRejection(
      corrupt((o) => {
        const s = o.seniority as { levels: unknown[] };
        s.levels = s.levels.slice(0, 3);
      }),
      "preferences.seniority.levels: missing seniority level(s) lead, management"
    );
  });

  it("rejects a term outside the config union — terms are confirmed, not authored", () => {
    expectRejection(
      corrupt((o) => {
        (o.seniority as { levels: { terms: string[] }[] }).levels[0].terms.push("grizzled");
      }),
      'preferences.seniority.levels[0].terms[3]: "grizzled" is not a known seniority term'
    );
  });

  it("accepts a term from ANOTHER level — membership of the union, not per-level equality", () => {
    const raw = corrupt((o) => {
      (o.seniority as { levels: { terms: string[] }[] }).levels[0].terms.push("tech lead");
    });
    expect(() => parsePreferences(raw)).not.toThrow();
  });

  it("accepts a level carrying FEWER terms than config — config may gain terms", () => {
    const raw = corrupt((o) => {
      (o.seniority as { levels: { terms: string[] }[] }).levels[0].terms = ["senior"];
    });
    expect(parsePreferences(raw).seniority.levels[0].terms).toEqual(["senior"]);
  });

  it("rejects a duplicate term within a level", () => {
    expectRejection(
      corrupt((o) => {
        (o.seniority as { levels: { terms: string[] }[] }).levels[0].terms.push("senior");
      }),
      'duplicate term "senior"'
    );
  });

  it("rejects a non-boolean excluded, naming the path", () => {
    expectRejection(
      corrupt((o) => {
        (o.seniority as { levels: { excluded: unknown }[] }).levels[2].excluded = "yes";
      }),
      "preferences.seniority.levels[2].excluded: expected boolean"
    );
  });

  it("rejects a non-boolean entry_level_query_modifier", () => {
    expectRejection(
      corrupt((o) => {
        (o.seniority as { entry_level_query_modifier: unknown }).entry_level_query_modifier = 1;
      }),
      "preferences.seniority.entry_level_query_modifier: expected boolean"
    );
  });

  it("round-trips the confirmed exclusions through write + read", () => {
    const path = join(dir, "seniority.json");
    writePreferences(path, valid());
    const reloaded = loadPreferences(path);
    expect(reloaded.seniority.levels.find((l) => l.level === "senior")?.excluded).toBe(true);
    expect(reloaded.seniority.levels.find((l) => l.level === "lead")?.excluded).toBe(false);
  });
});

describe("v1 → v2 migration", () => {
  it("rejects a v1 file with an actionable message, never upgrading it", () => {
    expect(() => parsePreferences(v1())).toThrow(ScopeValidationError);
    expect(() => parsePreferences(v1())).toThrow("predates the seniority dimension");
    expect(() => parsePreferences(v1())).toThrow("Run `oaos setup-scope`");
    expect(() => parsePreferences(v1())).toThrow("NOT changed and NOT upgraded");
  });

  it("names the real file on the migration stop", () => {
    const path = join(dir, "legacy.json");
    writeFileSync(path, JSON.stringify(v1()), "utf8");
    expect(() => loadPreferences(path)).toThrow(`${path}: schema version 1 predates`);
  });

  it("does NOT silently default a seniority block", () => {
    // The failure mode this whole path exists to prevent.
    expect(() => parsePreferences(v1())).toThrow();
  });
});

describe("parseBaseline — version-tolerant, for the editing baseline only", () => {
  it("reads a v1 file, reporting seniority as absent", () => {
    const baseline = parseBaseline(v1());
    expect(baseline.version).toBe(1);
    expect(baseline.seniority).toBeNull();
    expect(baseline.fields.map((f) => f.name)).toEqual(["Security", "wasm"]);
  });

  it("reads a v2 file, carrying the seniority selections", () => {
    const baseline = parseBaseline(valid());
    expect(baseline.version).toBe(2);
    expect(baseline.seniority?.levels.find((l) => l.level === "senior")?.excluded).toBe(true);
  });

  it("is NOT a Preferences — it carries no confirmed_at to launder", () => {
    expect(parseBaseline(valid())).not.toHaveProperty("confirmed_at");
  });

  it("still applies the strict field validation", () => {
    const raw = corrupt((o) => {
      (o.fields as { aspirational: boolean }[])[0].aspirational = true;
    });
    expect(() => parseBaseline(raw)).toThrow("preferences.fields[0].aspirational");
  });

  it("still validates a v2 file's seniority strictly", () => {
    const raw = corrupt((o) => {
      (o.seniority as { levels: { level: string }[] }).levels[0].level = "architect";
    });
    expect(() => parseBaseline(raw)).toThrow("unknown seniority level");
  });

  it("refuses a version newer than this build understands", () => {
    const raw = corrupt((o) => void (o.version = 99));
    expect(() => parseBaseline(raw)).toThrow("newer than this build understands");
  });

  it("rejects a non-integer version", () => {
    expect(() => parseBaseline(corrupt((o) => void (o.version = "1")))).toThrow(
      "expected a schema version integer"
    );
  });

  it("loads from disk through loadBaseline", () => {
    const path = join(dir, "baseline-v1.json");
    writeFileSync(path, JSON.stringify(v1()), "utf8");
    expect(loadBaseline(path).seniority).toBeNull();
  });
});
