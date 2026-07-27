// vocabulary.test.ts
// File: src/discovery/orchestrator/tests/vocabulary.test.ts
// Purpose: preferences.json → PrerankVocabulary mapping. Pure; the Preferences
//          objects here are built IN MEMORY. Nothing in this file writes
//          preferences.json — per D15, only the confirmed `oaos setup-scope`
//          path may ever produce that file.

import { describe, it, expect } from "vitest";
import { preferencesToVocabulary } from "../vocabulary";
import { DEFAULT_VOCABULARY } from "../../prerank/config";
import type { Preferences, ScopeField } from "../../scope/types";

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

function preferences(fields: ScopeField[]): Preferences {
  return {
    version: 1,
    generated_at: "2026-07-28T00:00:00.000Z",
    confirmed_at: "2026-07-28T00:05:00.000Z",
    fields,
    work_types: { job: true, internship: true, oss: true, freelance: false },
    remote_only: true,
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
