// scope-terms.test.ts
// File: src/discovery/stage3/tests/scope-terms.test.ts

import { describe, expect, it } from "vitest";
import { cappedTermsError, deriveQueryTerms, MAX_QUERY_TERMS } from "../query/scope-terms";
import { preferencesFixture } from "./query-helpers";

describe("deriveQueryTerms", () => {
  it("takes the enabled fields, lowercased, in preferences order", () => {
    const prefs = preferencesFixture(["Kubernetes", "Security", "eBPF"]);
    expect(deriveQueryTerms(prefs).terms).toEqual(["kubernetes", "security", "ebpf"]);
  });

  it("ignores disabled fields — an unticked field is never searched for", () => {
    const prefs = preferencesFixture(["Kubernetes"], ["Web/Frontend", "Data"]);
    expect(deriveQueryTerms(prefs).terms).toEqual(["kubernetes"]);
  });

  it("collapses duplicates and drops empties, preserving first-seen order", () => {
    const prefs = preferencesFixture(["Infra", "  ", "infra", "Data"]);
    expect(deriveQueryTerms(prefs).terms).toEqual(["infra", "data"]);
  });

  it("returns no terms when nothing is enabled", () => {
    expect(deriveQueryTerms(preferencesFixture([], ["Data"])).terms).toEqual([]);
  });

  it("passes the operator's real 13-field scope through uncapped", () => {
    const thirteen = [
      "Cloud-Native", "Kubernetes", "Security", "eBPF", "Chaos-Engineering",
      "Networking", "DevTools", "Infra", "Observability", "Web/Frontend",
      "Backend", "Data", "AI/ML",
    ];
    const result = deriveQueryTerms(preferencesFixture(thirteen));
    expect(result.terms).toHaveLength(13);
    expect(result.dropped).toEqual([]);
  });
});

describe("the query cap", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `term${i}`);

  it("caps at MAX_QUERY_TERMS and reports the rest as dropped", () => {
    const result = deriveQueryTerms(preferencesFixture(twenty));
    expect(result.terms).toHaveLength(MAX_QUERY_TERMS);
    expect(result.dropped).toHaveLength(20 - MAX_QUERY_TERMS);
    expect([...result.terms, ...result.dropped]).toEqual(twenty);
  });

  it("dropped terms become a reported SourceError, never a silent truncation", () => {
    const { dropped } = deriveQueryTerms(preferencesFixture(twenty));
    const error = cappedTermsError("himalayas", dropped);
    expect(error).not.toBeNull();
    expect(error?.kind).toBe("shape");
    expect(error?.detail).toContain("did NOT cover your full discovery scope");
    for (const term of dropped) expect(error?.detail).toContain(term);
  });

  it("reports nothing when the cap did not bite", () => {
    expect(cappedTermsError("himalayas", [])).toBeNull();
  });
});
