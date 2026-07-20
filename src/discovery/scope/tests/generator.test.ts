// generator.test.ts
// File: src/discovery/scope/tests/generator.test.ts
// Purpose: Fixture-driven tests for the pure derivation. No I/O, no clock — the
//          timestamp is injected so determinism is directly assertable.

import { describe, expect, it } from "vitest";
import { computeBacking, deriveScope, normalizeTerm } from "../generator";
import { SCOPE_VOCABULARY } from "../config";
import type { BaseResume, Evidence, OperatorProfile, Preferences } from "../types";

const NOW = "2026-07-20T12:00:00.000Z";

function evidence(over: Partial<Evidence> & { id: string }): Evidence {
  return {
    title: "t",
    type: "PR",
    url: "https://example.com",
    tech_tags: [],
    domains: [],
    relevance_blurb: "b",
    recency_date: "2026-01-01",
    strength: 3,
    ...over,
  };
}

function resume(over: Partial<BaseResume> = {}): BaseResume {
  return {
    name: "Operator",
    summary: "s",
    experience: [],
    projects: [],
    education: [],
    skills: [],
    ...over,
  };
}

function profile(over: Partial<OperatorProfile> = {}): OperatorProfile {
  return {
    name: "Operator",
    github: "operator",
    portfolio_url: "https://example.com",
    stack: [],
    ...over,
  };
}

function find(fields: { name: string }[], name: string) {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${name}`);
  return f as never as import("../types").ScopeField;
}

describe("normalizeTerm", () => {
  it("lowercases, trims, and collapses hyphens/underscores/whitespace", () => {
    expect(normalizeTerm("  Chaos-Engineering ")).toBe("chaos engineering");
    expect(normalizeTerm("Cloud_Native")).toBe("cloud native");
    expect(normalizeTerm("chaos   engineering")).toBe("chaos engineering");
  });

  it("preserves '/' so Web/Frontend and AI/ML match literally", () => {
    expect(normalizeTerm("Web/Frontend")).toBe("web/frontend");
    expect(normalizeTerm("AI/ML")).toBe("ai/ml");
  });
});

describe("computeBacking", () => {
  const inventory = [
    evidence({ id: "a", domains: ["Security", "Backend"] }),
    evidence({ id: "b", tech_tags: ["Kubernetes"] }),
    evidence({ id: "c", domains: ["security"], tech_tags: ["KUBERNETES"] }),
  ];

  it("matches across domains[] and tech_tags[], case-insensitively", () => {
    expect(computeBacking("Security", inventory)).toEqual({
      evidence_backed: true,
      supporting_evidence_ids: ["a", "c"],
    });
    expect(computeBacking("Kubernetes", inventory)).toEqual({
      evidence_backed: true,
      supporting_evidence_ids: ["b", "c"],
    });
  });

  it("returns ids in inventory order, deduped when both fields match", () => {
    const both = [evidence({ id: "x", domains: ["Infra"], tech_tags: ["Infra"] })];
    expect(computeBacking("Infra", both).supporting_evidence_ids).toEqual(["x"]);
  });

  it("does NOT fuzzy-match: a substring is not a match", () => {
    // The negative case that keeps derivation honest.
    expect(computeBacking("Networking", [evidence({ id: "n", domains: ["network"] })])).toEqual({
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
    expect(computeBacking("eBPF", [evidence({ id: "e", tech_tags: ["eBPF/LSM concepts"] })])).toEqual(
      { evidence_backed: false, supporting_evidence_ids: [] }
    );
  });

  it("reports no backing against an empty inventory", () => {
    expect(computeBacking("Security", [])).toEqual({
      evidence_backed: false,
      supporting_evidence_ids: [],
    });
  });
});

describe("deriveScope", () => {
  it("lists the whole vocabulary, in Engine 1's order, and never 'Other'", () => {
    const p = deriveScope({ resume: resume(), profile: profile(), inventory: [] }, { now: NOW });
    expect(p.fields.map((f) => f.name)).toEqual([...SCOPE_VOCABULARY]);
    expect(p.fields.map((f) => f.name)).not.toContain("Other");
  });

  it("marks evidence-backed fields with their supporting ids and pre-ticks them", () => {
    const inventory = [
      evidence({ id: "sec-1", domains: ["Security"] }),
      evidence({ id: "sec-2", domains: ["Security"] }),
      evidence({ id: "k8s-1", tech_tags: ["Kubernetes"] }),
    ];
    const p = deriveScope({ resume: resume(), profile: profile(), inventory }, { now: NOW });

    const security = find(p.fields, "Security");
    expect(security).toMatchObject({
      origin: "derived",
      evidence_backed: true,
      aspirational: false,
      enabled: true,
      supporting_evidence_ids: ["sec-1", "sec-2"],
    });
    expect(find(p.fields, "Kubernetes").supporting_evidence_ids).toEqual(["k8s-1"]);
    expect(find(p.fields, "Data").enabled).toBe(false);
  });

  it("pre-ticks a profile-matched field but leaves evidence_backed false", () => {
    const p = deriveScope(
      {
        resume: resume({ skills: ["kubernetes"] }),
        profile: profile({ stack: ["chaos engineering"] }),
        inventory: [],
      },
      { now: NOW }
    );
    expect(find(p.fields, "Kubernetes")).toMatchObject({
      enabled: true,
      evidence_backed: false,
      aspirational: false, // derived, so never aspirational
      supporting_evidence_ids: [],
    });
    expect(find(p.fields, "Chaos-Engineering").enabled).toBe(true);
    expect(find(p.fields, "Chaos-Engineering").evidence_backed).toBe(false);
  });

  it("scans resume skills, project tech_tags, and profile stack alike", () => {
    const p = deriveScope(
      {
        resume: resume({
          skills: ["Backend"],
          projects: [{ name: "p", description: "d", bullets: [], tech_tags: ["Observability"] }],
        }),
        profile: profile({ stack: ["DevTools"] }),
        inventory: [],
      },
      { now: NOW }
    );
    expect(find(p.fields, "Backend").enabled).toBe(true);
    expect(find(p.fields, "Observability").enabled).toBe(true);
    expect(find(p.fields, "DevTools").enabled).toBe(true);
  });

  it("does NOT pre-tick on a near-miss profile term (no fuzzy matching)", () => {
    const p = deriveScope(
      {
        resume: resume({ skills: ["network programming"] }),
        profile: profile({ stack: ["eBPF/LSM concepts"] }),
        inventory: [],
      },
      { now: NOW }
    );
    expect(find(p.fields, "Networking").enabled).toBe(false);
    expect(find(p.fields, "eBPF").enabled).toBe(false);
  });

  it("survives an empty inventory: nothing backed, profile still proposes", () => {
    const p = deriveScope(
      { resume: resume({ skills: ["Infra"] }), profile: profile(), inventory: [] },
      { now: NOW }
    );
    expect(p.fields.every((f) => f.evidence_backed === false)).toBe(true);
    expect(p.fields.every((f) => f.supporting_evidence_ids.length === 0)).toBe(true);
    expect(find(p.fields, "Infra").enabled).toBe(true);
  });

  it("proposes the Phase 1 work types with freelance locked off", () => {
    const p = deriveScope({ resume: resume(), profile: profile(), inventory: [] }, { now: NOW });
    expect(p.work_types).toEqual({ job: true, internship: true, oss: true, freelance: false });
  });

  it("is deterministic on fixed inputs", () => {
    const inputs = {
      resume: resume({ skills: ["Kubernetes"] }),
      profile: profile({ stack: ["Backend"] }),
      inventory: [evidence({ id: "a", domains: ["Security"] })],
    };
    expect(deriveScope(inputs, { now: NOW })).toEqual(deriveScope(inputs, { now: NOW }));
  });

  describe("re-run against an existing scope", () => {
    const existing: Preferences = {
      version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      confirmed_at: "2026-01-01T00:00:00.000Z",
      fields: [
        {
          name: "Security",
          origin: "derived",
          evidence_backed: false,
          aspirational: false,
          enabled: false, // operator explicitly unticked it
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
    };

    it("carries the operator's ticks forward, even against a fresh proposal", () => {
      // Security is now evidence-backed, but the operator unticked it — respect that.
      const p = deriveScope(
        {
          resume: resume(),
          profile: profile(),
          inventory: [evidence({ id: "sec", domains: ["Security"] })],
          existing,
        },
        { now: NOW }
      );
      expect(find(p.fields, "Security")).toMatchObject({
        enabled: false,
        evidence_backed: true,
        supporting_evidence_ids: ["sec"],
      });
    });

    it("reports fields that gained evidence backing since the last run", () => {
      const p = deriveScope(
        {
          resume: resume(),
          profile: profile(),
          inventory: [evidence({ id: "sec", domains: ["Security"] })],
          existing,
        },
        { now: NOW }
      );
      expect(p.newly_backed).toEqual(["Security"]);
    });

    it("keeps operator-added custom fields and recomputes their backing", () => {
      const p = deriveScope(
        {
          resume: resume(),
          profile: profile(),
          inventory: [evidence({ id: "w", tech_tags: ["wasm"] })],
          existing,
        },
        { now: NOW }
      );
      const wasm = find(p.fields, "wasm");
      expect(wasm).toMatchObject({
        origin: "operator_added",
        evidence_backed: true,
        aspirational: false, // backing arrived → no longer aspirational
        enabled: true,
        supporting_evidence_ids: ["w"],
      });
      expect(p.fields[p.fields.length - 1].name).toBe("wasm"); // custom terms come last
    });

    it("uses the existing work-type selection as the baseline", () => {
      const p = deriveScope(
        { resume: resume(), profile: profile(), inventory: [], existing },
        { now: NOW }
      );
      expect(p.work_types).toEqual({ job: true, internship: false, oss: true, freelance: false });
    });

    it("reports nothing as newly-backed on a fresh run", () => {
      const p = deriveScope(
        {
          resume: resume(),
          profile: profile(),
          inventory: [evidence({ id: "sec", domains: ["Security"] })],
        },
        { now: NOW }
      );
      expect(p.newly_backed).toEqual([]);
    });
  });
});
