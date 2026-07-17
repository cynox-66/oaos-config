// tests/format.test.ts
// Unit tests for the pure formatters in cli/format.ts (F6).

import { describe, it, expect } from "vitest";
import {
  formatIntakeSummary,
  formatPackageFlags,
  formatScoreChange,
  formatContactsImport,
  formatReport,
} from "../format";

describe("formatIntakeSummary", () => {
  it("shows the written record id on success", () => {
    const out = formatIntakeSummary({
      company: "Acme",
      role: "SRE",
      category: "Job",
      tier: "A",
      total: 72,
      action: "Both",
      contactCount: 0,
      recordId: "rec123",
      errors: [],
    });
    expect(out).toContain("Acme — SRE");
    expect(out).toContain("72/100");
    expect(out).toContain("Tier A");
    expect(out).toContain("rec123");
    expect(out).not.toContain("FAILED");
  });

  it("shows FAILED and errors when the write failed", () => {
    const out = formatIntakeSummary({
      company: "Acme",
      role: "SRE",
      category: "Job",
      tier: "C",
      total: 10,
      action: "Ignore",
      contactCount: 0,
      recordId: null,
      errors: ["422 Unknown field 'Foo'"],
    });
    expect(out).toContain("FAILED");
    expect(out).toContain("422 Unknown field 'Foo'");
  });
});

describe("formatScoreChange", () => {
  it("renders before/after and notes first-match only when ambiguous", () => {
    const out = formatScoreChange({
      company: "Acme",
      usingFirstMatch: true,
      oldQuality: 30,
      newQuality: 40,
      oldMatch: 20,
      newMatch: 25,
      oldTotal: 50,
      newTotal: 65,
      oldTier: "B",
      newTier: "A",
    });
    expect(out).toContain("Using first match for Acme");
    expect(out).toContain("Quality : 30 → 40");
    expect(out).toContain("Total   : 50 → 65");
    expect(out).toContain("Tier    : B → A");
  });

  it("renders em-dash for missing prior values and omits the note", () => {
    const out = formatScoreChange({
      company: "New Co",
      usingFirstMatch: false,
      oldQuality: null,
      newQuality: 40,
      oldMatch: null,
      newMatch: 25,
      oldTotal: null,
      newTotal: 65,
      oldTier: null,
      newTier: "A",
    });
    expect(out).not.toContain("Using first match");
    expect(out).toContain("Quality : — → 40");
    expect(out).toContain("Tier    : — → A");
  });
});

describe("formatContactsImport", () => {
  it("summarizes created/failed and truncates long error lists", () => {
    const errors = Array.from({ length: 12 }, (_, i) => `err ${i}`);
    const out = formatContactsImport({
      file: "/x/krkn-airtable-1.json",
      total: 15,
      created: 3,
      failed: 12,
      errors,
    });
    expect(out).toContain("Created : 3");
    expect(out).toContain("Failed  : 12");
    expect(out).toContain("krkn-airtable-1.json");
    expect(out).toContain("and 2 more");
  });
});

describe("formatReport", () => {
  it("renders all metrics and the top list", () => {
    const out = formatReport({
      discoveredThisWeek: 4,
      sentThisWeek: 2,
      responsesAllTime: 5,
      followUpsDueToday: 1,
      topUnactioned: [
        { company: "Acme", role: "SRE", total: 80, tier: "S", source: "wellfound" },
        { company: "Beta", role: "Eng", total: 70, tier: "A", source: "lfx" },
      ],
    });
    expect(out).toContain("Discovered this week   : 4");
    expect(out).toContain("Responses (all time)   : 5");
    expect(out).toContain("Follow-ups due today   : 1");
    expect(out).toContain("[S] 80  Acme — SRE  (wellfound)");
  });

  it("shows (none) when nothing is unactioned", () => {
    const out = formatReport({
      discoveredThisWeek: 0,
      sentThisWeek: 0,
      responsesAllTime: 0,
      followUpsDueToday: 0,
      topUnactioned: [],
    });
    expect(out).toContain("(none)");
  });
});

describe("formatPackageFlags (#12a)", () => {
  it("returns empty string when there is nothing to show (no block, no friction)", () => {
    expect(formatPackageFlags({ hard: [], reviewOnly: [], semanticDegraded: false })).toBe("");
  });

  it("review-only flags render distinctly, without a hard section", () => {
    const out = formatPackageFlags({
      hard: [],
      reviewOnly: ["My chaos work equipped me to build robust tooling."],
      semanticDegraded: false,
    });
    expect(out).toContain("REVIEW-ONLY");
    expect(out).toContain("did NOT trigger regeneration");
    expect(out).toContain("My chaos work equipped me to build robust tooling.");
    expect(out).not.toContain("HARD");
    expect(out).not.toContain("DEGRADED");
  });

  it("hard and review-only flags render as visually distinct sections in one block", () => {
    const out = formatPackageFlags({
      hard: ["I have 9 years experience."],
      reviewOnly: ["A true paraphrase sentence."],
      semanticDegraded: false,
    });
    expect(out).toContain("HARD fabrication flags");
    expect(out).toContain("I have 9 years experience.");
    expect(out).toContain("REVIEW-ONLY");
    expect(out).toContain("A true paraphrase sentence.");
    expect(out.indexOf("HARD")).toBeLessThan(out.indexOf("REVIEW-ONLY"));
  });

  it("semantic degradation renders INSIDE the same block as the flags (Q2: never buried)", () => {
    const out = formatPackageFlags({
      hard: [],
      reviewOnly: ["A true paraphrase sentence."],
      semanticDegraded: true,
    });
    expect(out).toContain("REVIEW-ONLY");
    expect(out).toContain("SEMANTIC AUDIT DEGRADED");
    // One contiguous block: degradation appears before the closing rule.
    expect(out.indexOf("SEMANTIC AUDIT DEGRADED")).toBeLessThan(out.lastIndexOf("────"));
  });

  it("degradation alone (no flags) still renders — a failed AI check is never silent", () => {
    const out = formatPackageFlags({ hard: [], reviewOnly: [], semanticDegraded: true });
    expect(out).toContain("SEMANTIC AUDIT DEGRADED");
  });
});
