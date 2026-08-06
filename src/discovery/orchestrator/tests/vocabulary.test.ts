// vocabulary.test.ts
// File: src/discovery/orchestrator/tests/vocabulary.test.ts
// Purpose: preferences.json → PrerankVocabulary mapping. Pure; the Preferences
//          objects here are built IN MEMORY. Nothing in this file writes
//          preferences.json — per D15, only the confirmed `oaos setup-scope`
//          path may ever produce that file.

import { describe, it, expect } from "vitest";
import { preferencesToVocabulary } from "../vocabulary";
import { DEFAULT_VOCABULARY } from "../../prerank/config";
import { SENIORITY_LEVELS } from "../../scope/seniority";
import type { Preferences, ScopeField, SeniorityPreference } from "../../scope/types";

function field(name: string, enabled: boolean): ScopeField {
  return {
    name,
    origin: "derived",
    evidence_backed: true,
    aspirational: false,
    enabled,
    supporting_evidence_ids: ["C4-01"],
  };
}

/** Every level present; `excluded` names the ones the operator ticked. */
function seniority(excluded: string[] = [], entry_level_query_modifier = false): SeniorityPreference {
  return {
    levels: SENIORITY_LEVELS.map((level) => ({
      level: level.id,
      excluded: excluded.includes(level.id),
      terms: [...level.terms],
    })),
    entry_level_query_modifier,
  };
}

function preferences(fields: ScopeField[], seniorityPreference = seniority()): Preferences {
  return {
    version: 2,
    generated_at: "2026-07-28T00:00:00.000Z",
    confirmed_at: "2026-07-28T00:05:00.000Z",
    fields,
    work_types: { job: true, internship: true, oss: true, freelance: false },
    remote_only: true,
    seniority: seniorityPreference,
  };
}

describe("preferencesToVocabulary", () => {
  it("takes domainTerms from the ENABLED fields only", () => {
    const vocabulary = preferencesToVocabulary(
      preferences([field("Kubernetes", true), field("eBPF", false), field("Security", true)])
    );
    expect(vocabulary.domainTerms).toEqual(["kubernetes", "security"]);
  });

  it("lowercases and trims, preserving field order", () => {
    const vocabulary = preferencesToVocabulary(
      preferences([field("  Cloud-Native ", true), field("Chaos-Engineering", true)])
    );
    expect(vocabulary.domainTerms).toEqual(["cloud-native", "chaos-engineering"]);
  });

  it("collapses duplicates that differ only by case or whitespace", () => {
    const vocabulary = preferencesToVocabulary(
      preferences([field("Kubernetes", true), field("kubernetes ", true), field("KUBERNETES", true)])
    );
    expect(vocabulary.domainTerms).toEqual(["kubernetes"]);
  });

  it("drops empty field names rather than emitting a term that matches nothing", () => {
    const vocabulary = preferencesToVocabulary(preferences([field("   ", true), field("Infra", true)]));
    expect(vocabulary.domainTerms).toEqual(["infra"]);
  });

  it("sources roleTerms and negativeTerms from DEFAULT_VOCABULARY (preferences.json has neither)", () => {
    const vocabulary = preferencesToVocabulary(preferences([field("Kubernetes", true)]));
    expect(vocabulary.roleTerms).toEqual(DEFAULT_VOCABULARY.roleTerms);
    expect(vocabulary.negativeTerms).toEqual(DEFAULT_VOCABULARY.negativeTerms);
  });

  it("does not alias DEFAULT_VOCABULARY's arrays — a caller cannot mutate the shared default", () => {
    const vocabulary = preferencesToVocabulary(preferences([field("Kubernetes", true)]));
    vocabulary.roleTerms.push("mutated");
    expect(DEFAULT_VOCABULARY.roleTerms).not.toContain("mutated");
  });

  it("yields an empty domain list when every field is unticked (prerank still has roleTerms)", () => {
    const vocabulary = preferencesToVocabulary(preferences([field("Kubernetes", false)]));
    expect(vocabulary.domainTerms).toEqual([]);
    expect(vocabulary.roleTerms.length).toBeGreaterThan(0);
  });
});

describe("preferencesToVocabulary — seniority → negativeTerms (A1)", () => {
  const fields = [field("Kubernetes", true)];

  it("contributes nothing when no level is excluded", () => {
    expect(preferencesToVocabulary(preferences(fields)).negativeTerms).toEqual(
      DEFAULT_VOCABULARY.negativeTerms
    );
  });

  it("unions the excluded levels' persisted terms with DEFAULT_VOCABULARY's", () => {
    const vocabulary = preferencesToVocabulary(preferences(fields, seniority(["senior"])));
    expect(vocabulary.negativeTerms).toEqual([
      ...DEFAULT_VOCABULARY.negativeTerms,
      "senior",
      "sr.",
      "sr engineer",
    ]);
  });

  it("keeps config level order across several excluded levels", () => {
    const vocabulary = preferencesToVocabulary(
      preferences(fields, seniority(["management", "staff"]))
    );
    expect(vocabulary.negativeTerms.slice(0, 3)).toEqual([
      "staff engineer",
      "staff software engineer",
      "engineering manager",
    ]);
  });

  it("dedupes an overlap rather than double-counting it", () => {
    const overlapping = seniority(["senior", "lead"]);
    overlapping.levels[3].terms = [...overlapping.levels[3].terms, "senior"];
    const terms = preferencesToVocabulary(preferences(fields, overlapping)).negativeTerms;
    expect(terms.filter((t) => t === "senior")).toHaveLength(1);
  });

  it("normalizes to prerank's matching form", () => {
    const messy = seniority(["senior"]);
    messy.levels[0].terms = ["  Senior  "];
    expect(preferencesToVocabulary(preferences(fields, messy)).negativeTerms).toEqual(["senior"]);
  });

  it("leaves domainTerms and roleTerms untouched — the union is negativeTerms only", () => {
    const withExclusions = preferencesToVocabulary(preferences(fields, seniority(["senior"])));
    const without = preferencesToVocabulary(preferences(fields));
    expect(withExclusions.domainTerms).toEqual(without.domainTerms);
    expect(withExclusions.roleTerms).toEqual(DEFAULT_VOCABULARY.roleTerms);
  });

  it("is unaffected by the entry-level query modifier — that lever is A3, not A1", () => {
    const modifierOnly = preferencesToVocabulary(preferences(fields, seniority([], true)));
    expect(modifierOnly.negativeTerms).toEqual(DEFAULT_VOCABULARY.negativeTerms);
  });
});
