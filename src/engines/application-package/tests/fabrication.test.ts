// tests/fabrication.test.ts
// Pure fabrication trace-check: pass on grounded text, flag on years-of-
// experience / unlisted titles / untraceable claims, with offending sentences.

import { describe, it, expect } from "vitest";
import { checkFabrication } from "../fabrication";
import { INVENTORY, makeBaseResume, makeOpportunity, CLEAN_LETTER, FLAGGED_LETTER } from "./helpers";

const base = makeBaseResume();
const opportunity = makeOpportunity();
const roleDescription = "Work on eBPF security for Kubernetes.";
const check = (letter: string) => checkFabrication(letter, base, INVENTORY, opportunity, roleDescription);

describe("checkFabrication", () => {
  it("passes a letter grounded in base + inventory + opportunity terms", () => {
    const result = check(CLEAN_LETTER);
    expect(result.fabrication_check).toBe("pass");
    expect(result.flagged_sentences).toEqual([]);
  });

  it("flags a years-of-experience claim absent from the base resume", () => {
    const result = check("I have 5 years experience in eBPF security.");
    expect(result.fabrication_check).toBe("flag");
    expect(result.flagged_sentences[0]).toContain("5 years");
  });

  it("flags a title not present in the base resume (Staff)", () => {
    // base has "Security Engineer", never "Staff".
    const result = check("I am a Staff Engineer at AccuKnox.");
    expect(result.fabrication_check).toBe("flag");
  });

  it("flags an untraceable claim (too many unsupported tokens)", () => {
    const result = check("I architected distributed blockchain quantum trading platforms globally.");
    expect(result.fabrication_check).toBe("flag");
  });

  it("flags the combined fabricated letter and lists the offending sentence", () => {
    const result = check(FLAGGED_LETTER);
    expect(result.fabrication_check).toBe("flag");
    expect(result.flagged_sentences.length).toBeGreaterThanOrEqual(1);
    expect(result.flagged_sentences.some((s) => s.includes("5 years"))).toBe(true);
  });
});
