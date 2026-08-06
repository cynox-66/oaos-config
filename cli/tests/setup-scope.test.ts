// setup-scope.test.ts
// File: cli/tests/setup-scope.test.ts
// Purpose: The non-interactive parts of `oaos setup-scope` — pure rendering,
//          `--show`, and the missing-file path — plus one end-to-end pass over
//          the pure chain (derive → confirm → build → validate → round-trip),
//          which is the whole command minus readline.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { renderPreferences, renderState, runSetupScope } from "../commands/setup-scope";
import {
  buildPreferences,
  deriveScope,
  initialState,
  loadPreferences,
  parsePreferences,
  reduceScope,
  writePreferences,
} from "../../src/discovery/scope";
import { SENIORITY_LEVELS } from "../../src/discovery/scope/seniority";
import type { BaseResume, OperatorProfile, Preferences } from "../../src/discovery/scope/types";

const dir = mkdtempSync(join(tmpdir(), "oaos-setup-scope-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function preferences(over: Partial<Preferences> = {}): Preferences {
  return {
    version: 3,
    generated_at: "2026-07-20T12:00:00.000Z",
    confirmed_at: "2026-07-20T12:05:00.000Z",
    fields: [
      {
        name: "Security",
        origin: "derived",
        evidence_backed: true,
        aspirational: false,
        enabled: true,
        supporting_evidence_ids: ["sec-1", "sec-2"],
      },
      {
        name: "Data",
        origin: "derived",
        evidence_backed: false,
        aspirational: false,
        enabled: false,
        supporting_evidence_ids: [],
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
    work_types: { job: true, internship: false, oss: true, freelance: false },
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
    ...over,
  };
}

describe("renderPreferences (pure)", () => {
  const text = renderPreferences(preferences());

  it("separates what is searched from what is not", () => {
    expect(text).toContain("Searching for (2)");
    expect(text).toContain("[x] Security");
    expect(text).toContain("Not searching (1)");
    expect(text).toContain("Data");
  });

  it("shows supporting evidence ids for backed fields", () => {
    expect(text).toContain("sec-1, sec-2");
  });

  it("labels an operator-added field as aspirational", () => {
    expect(text).toMatch(/\[x\] wasm\s+\(operator-added, aspirational\)/);
  });

  it("states both locks", () => {
    expect(text).toContain("freelance: off (locked)");
    expect(text).toContain("Remote-only: true (locked)");
  });

  it("says so plainly when nothing is enabled", () => {
    const empty = preferences({
      fields: preferences().fields.map((f) => ({ ...f, enabled: false })),
    });
    expect(renderPreferences(empty)).toContain("discovery would return nothing");
  });
});

describe("renderState (pure)", () => {
  const state = initialState({
    generated_at: "2026-07-20T12:00:00.000Z",
    newly_backed: ["Security"],
    work_types: { job: true, internship: true, oss: true, freelance: false },
    fields: preferences().fields,
    seniority: {
      levels: SENIORITY_LEVELS.map((level) => ({
        level: level.id,
        excluded: false,
        terms: [...level.terms],
        available: [],
      })),
      entry_level_query_modifier: false,
    },
    geo: { countries: ["IN"], worldwide_ok: true, unresolved: "pass", off: false, touched: true },
    role_types: [],
  });
  const text = renderState(state, ["Security"]);

  it("groups the map the way D15 asks", () => {
    expect(text).toContain("Evidence-backed");
    expect(text).toContain("Profile-matched, no evidence yet");
    expect(text).toContain("Available, unticked");
  });

  it("numbers fields by stable index, not by position within a group", () => {
    expect(text).toMatch(/1\. \[x\] Security/);
    expect(text).toMatch(/3\. \[x\] wasm/);
    expect(text).toMatch(/2\. \[ \] Data/);
  });

  it("flags fields that gained evidence since the last run", () => {
    expect(text).toContain("NEW EVIDENCE");
  });

  it("shows freelance as locked off", () => {
    expect(text).toContain("freelance (locked off in v1)");
  });
});

describe("runSetupScope --show", () => {
  it("prints the saved scope", async () => {
    const cwd = join(dir, "with-prefs");
    mkdirSync(cwd, { recursive: true });
    writePreferences(join(cwd, "preferences.json"), preferences());

    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await runSetupScope(["--show"]);

    expect(out.mock.calls.map((c) => String(c[0])).join("")).toContain("Searching for (2)");
    expect(process.exitCode).toBeUndefined();
  });

  it("points at setup-scope and exits non-zero when the file is missing", async () => {
    const cwd = join(dir, "no-prefs");
    mkdirSync(cwd, { recursive: true });

    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await runSetupScope(["--show"]);

    const text = err.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("No preferences.json found");
    expect(text).toContain("oaos setup-scope");
    expect(process.exitCode).toBe(1);
  });

  it("surfaces a malformed file rather than showing a coerced view", async () => {
    const cwd = join(dir, "bad-prefs");
    mkdirSync(cwd, { recursive: true });
    const broken = { ...preferences(), remote_only: false };
    writeFileSync(join(cwd, "preferences.json"), JSON.stringify(broken), "utf8");

    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await expect(runSetupScope(["--show"])).rejects.toThrow("remote_only: must be true");
  });
});

describe("end-to-end over the pure chain", () => {
  const resume: BaseResume = {
    name: "Operator",
    summary: "s",
    experience: [],
    projects: [],
    education: [],
    skills: ["Kubernetes"],
  };
  const profile: OperatorProfile = {
    name: "Operator",
    github: "op",
    portfolio_url: "https://example.com",
    stack: [],
  };
  const inventory = [
    {
      id: "sec-1",
      title: "t",
      type: "PR" as const,
      url: "https://example.com",
      tech_tags: [],
      domains: ["Security"],
      relevance_blurb: "b",
      recency_date: "2026-01-01",
      strength: 4,
    },
  ];

  it("derives → operator edits → confirms → writes a file that validates and reloads", () => {
    const proposal = deriveScope(
      { resume, profile, inventory },
      { now: "2026-07-20T12:00:00.000Z" }
    );

    let state = initialState(proposal);
    state = reduceScope(state, { kind: "toggle_field", name: "Kubernetes" }); // untick
    state = reduceScope(state, {
      kind: "add_field",
      name: "wasm",
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
    state = reduceScope(state, { kind: "toggle_work_type", key: "internship" });
    // The v3 geo section refuses `done` while active-and-empty — the operator
    // must either add an eligible country or explicitly `geo off`.
    state = reduceScope(state, { kind: "geo_add_country", code: "in" });
    state = reduceScope(state, { kind: "confirm" });

    const prefs = buildPreferences(state, {
      generated_at: proposal.generated_at,
      confirmed_at: "2026-07-20T12:05:00.000Z",
    });

    // The confirmed object satisfies the on-disk validator by construction.
    expect(() => parsePreferences(prefs)).not.toThrow();

    const path = join(dir, "e2e.json");
    writePreferences(path, prefs);
    const reloaded = loadPreferences(path);

    expect(reloaded).toEqual(prefs);
    expect(reloaded.fields.find((f) => f.name === "Security")).toMatchObject({
      enabled: true,
      evidence_backed: true,
      supporting_evidence_ids: ["sec-1"],
    });
    expect(reloaded.fields.find((f) => f.name === "Kubernetes")!.enabled).toBe(false);
    expect(reloaded.fields.find((f) => f.name === "wasm")).toMatchObject({
      origin: "operator_added",
      aspirational: true,
      enabled: true,
    });
    expect(reloaded.work_types).toEqual({
      job: true,
      internship: false,
      oss: true,
      freelance: false,
    });
    expect(reloaded.geo).toEqual({
      eligible_countries: ["IN"],
      worldwide_ok: true,
      unresolved: "pass",
    });
    expect(reloaded.role_types.every((t) => !t.excluded)).toBe(true);
  });

  it("a re-run of derivation over the saved file preserves the operator's ticks", () => {
    const existing = loadPreferences(join(dir, "e2e.json"));
    const rerun = deriveScope(
      { resume, profile, inventory, existing },
      { now: "2026-08-01T00:00:00.000Z" }
    );
    expect(rerun.fields.find((f) => f.name === "Kubernetes")!.enabled).toBe(false);
    expect(rerun.fields.find((f) => f.name === "wasm")).toMatchObject({
      origin: "operator_added",
      enabled: true,
    });
    expect(rerun.work_types.internship).toBe(false);
  });
});

describe("seniority rendering (pure)", () => {
  const state = initialState({
    generated_at: "2026-07-20T12:00:00.000Z",
    newly_backed: [],
    work_types: { job: true, internship: true, oss: true, freelance: false },
    fields: preferences().fields,
    seniority: {
      levels: SENIORITY_LEVELS.map((level) => ({
        level: level.id,
        excluded: level.id === "senior",
        terms: level.id === "staff" ? [level.terms[0]] : [...level.terms],
        available: level.id === "staff" ? [level.terms[1]] : [],
      })),
      entry_level_query_modifier: false,
    },
    geo: { countries: ["IN"], worldwide_ok: true, unresolved: "pass", off: false, touched: true },
    role_types: [],
  });
  const text = renderState(state);

  it("lists every level under its own s<n> namespace", () => {
    expect(text).toContain("s1. [x] senior");
    expect(text).toContain("s5. [ ] management");
  });

  it("shows the exact terms, so the operator confirms what they can see", () => {
    expect(text).toContain("terms: senior, sr., sr engineer");
  });

  it("warns that matching is whole-text, at the moment of confirmation", () => {
    expect(text).toContain("match anywhere in a posting's TEXT");
  });

  it("surfaces newly available terms with the command that adopts them", () => {
    expect(text).toContain("<NEW TERMS>");
    expect(text).toContain("available: staff software engineer");
    expect(text).toContain("'adopt s2' to include");
  });

  it("renders the entry-level modifier as its own toggle", () => {
    expect(text).toContain('entry  [ ] append "entry level"');
  });
});

describe("renderPreferences — seniority", () => {
  it("reports 'none' when nothing is excluded", () => {
    const text = renderPreferences(preferences());
    expect(text).toContain("Seniority exclusions (0)");
    expect(text).toContain("no posting is gated on seniority");
    expect(text).toContain("Entry-level query modifier: off");
  });

  it("names each excluded level and the terms it expands to", () => {
    const p = preferences();
    p.seniority.levels[0].excluded = true;
    p.seniority.entry_level_query_modifier = true;
    const text = renderPreferences(p);
    expect(text).toContain("Seniority exclusions (1)");
    expect(text).toContain("[x] senior  →  senior, sr., sr engineer");
    expect(text).toContain("Entry-level query modifier: on");
  });
});
