// tests/resume.test.ts
// Pure resume-variant behaviour: determinism, domain-relevance reordering,
// and the no-invention guarantee.

import { describe, it, expect } from "vitest";
import { buildResumeVariant } from "../resume";
import type { BaseResume } from "../types";
import { INVENTORY, makeBaseResume, makeOpportunity, makeMatch } from "./helpers";

const opportunity = makeOpportunity();
const match = makeMatch(["kubearmor", "krkn-chaos"]);

function allBullets(resume: BaseResume): string[] {
  return [
    ...resume.experience.flatMap((e) => e.bullets),
    ...resume.projects.flatMap((p) => p.bullets),
  ];
}

describe("buildResumeVariant", () => {
  it("is deterministic", () => {
    const base = makeBaseResume();
    expect(buildResumeVariant(base, opportunity, match, INVENTORY)).toEqual(
      buildResumeVariant(base, opportunity, match, INVENTORY)
    );
  });

  it("sorts matching-tech_tags projects ahead of non-matching ones", () => {
    const variant = buildResumeVariant(makeBaseResume(), opportunity, match, INVENTORY);
    const names = variant.projects.map((p) => p.name);
    // KubeArmor (eBPF/Security/Kubernetes) and Krkn (Kubernetes) before Portfolio (React).
    expect(names[0]).toBe("KubeArmor");
    expect(names[names.length - 1]).toBe("Portfolio");
    expect(names.indexOf("KubeArmor")).toBeLessThan(names.indexOf("Portfolio"));
  });

  it("never invents — every variant bullet exists in the base (same multiset)", () => {
    const base = makeBaseResume();
    const variant = buildResumeVariant(base, opportunity, match, INVENTORY);
    expect([...allBullets(variant)].sort()).toEqual([...allBullets(base)].sort());
  });

  it("does not mutate the input base resume", () => {
    const base = makeBaseResume();
    const snapshot = JSON.parse(JSON.stringify(base));
    buildResumeVariant(base, opportunity, match, INVENTORY);
    expect(base).toEqual(snapshot);
  });
});
