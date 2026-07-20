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
import type { BaseResume, OperatorProfile, Preferences } from "../../src/discovery/scope/types";

const dir = mkdtempSync(join(tmpdir(), "oaos-setup-scope-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function preferences(over: Partial<Preferences> = {}): Preferences {
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
