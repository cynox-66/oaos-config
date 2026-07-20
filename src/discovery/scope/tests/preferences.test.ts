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
  loadPreferences,
  parsePreferences,
  ScopeValidationError,
  writePreferences,
} from "../preferences";
import type { Preferences } from "../types";

const dir = mkdtempSync(join(tmpdir(), "oaos-scope-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function valid(): Preferences {
  return {
    version: 1,
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

  it("rejects the wrong version", () => {
    expectRejection(corrupt((o) => void (o.version = 2)), "preferences.version: expected 1");
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
