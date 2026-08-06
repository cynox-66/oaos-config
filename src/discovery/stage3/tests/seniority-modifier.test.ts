// seniority-modifier.test.ts
// File: src/discovery/stage3/tests/seniority-modifier.test.ts
// Purpose: The query_net seniority modifier composer. Pure; no network.

import { describe, expect, it } from "vitest";
import { ENTRY_LEVEL_MODIFIER } from "../../scope/seniority";
import { queryTermWithSeniority } from "../query/seniority-modifier";
import { preferencesFixture, seniorityFixture } from "./query-helpers";

const off = preferencesFixture(["Kubernetes"]);
const on = preferencesFixture(["Kubernetes"], [], seniorityFixture([], true));

describe("queryTermWithSeniority", () => {
  it("returns the term untouched when the modifier is not confirmed", () => {
    expect(queryTermWithSeniority("kubernetes", off)).toBe("kubernetes");
  });

  it("appends the modifier when it is confirmed", () => {
    expect(queryTermWithSeniority("kubernetes", on)).toBe("kubernetes entry level");
  });

  it("is independent of the exclusion ticks", () => {
    const excludedOnly = preferencesFixture(["Kubernetes"], [], seniorityFixture(["senior"], false));
    expect(queryTermWithSeniority("kubernetes", excludedOnly)).toBe("kubernetes");
  });

  it("decorates a term that already carries other qualifiers (the adzuna shape)", () => {
    expect(queryTermWithSeniority("kubernetes remote", on)).toBe("kubernetes remote entry level");
  });

  it("is idempotent — a term already ending in the modifier is not decorated twice", () => {
    expect(queryTermWithSeniority(`kubernetes ${ENTRY_LEVEL_MODIFIER}`, on)).toBe(
      "kubernetes entry level"
    );
  });

  it("trims, and degrades to the bare modifier on an empty term", () => {
    expect(queryTermWithSeniority("  kubernetes  ", on)).toBe("kubernetes entry level");
    expect(queryTermWithSeniority("   ", on)).toBe("entry level");
  });
});
