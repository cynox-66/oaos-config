// tests/fabrication.test.ts
// Layer 1 — the pure, deterministic fabrication floor. No LLM/client anywhere
// in this file: every verdict here must hold with the semantic layer entirely
// absent. Covers: pass on grounded text, the four hard rules (years-of-
// experience, unlisted titles, untraceable puffery, narrowed unsupported-
// content-token rule), and the #7 false-positive connectives now passing.

import { describe, it, expect } from "vitest";
import { checkFabrication } from "../fabrication";
import { INVENTORY, makeBaseResume, makeOpportunity, CLEAN_LETTER, FLAGGED_LETTER } from "./helpers";

const base = makeBaseResume();
const opportunity = makeOpportunity();
const roleDescription = "Work on eBPF security for Kubernetes.";
const check = (letter: string) => checkFabrication(letter, base, INVENTORY, opportunity, roleDescription);

describe("checkFabrication — Layer 1 floor (REGRESSION: real fabrications keep flagging)", () => {
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

  it("flags an invented-project claim (too many unsupported content tokens)", () => {
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

describe("checkFabrication — #7 false positives: no-claim connectives now pass", () => {
  const CONNECTIVES = [
    "Dear Hiring Team,",
    "My experience is grounded in two key areas.",
    "My experience is defined by two key technical contributions.",
    // Verbatim from the #7 finding (docs/known-issues.md). NOTE: a longer
    // variant ending "…and deliver reliable solutions" WOULD flag now that
    // "solutions" counts as content — 3 content tokens (codebases, deliver,
    // solutions) exceed the limit of 2. Accepted fail-closed trade-off.
    "These experiences demonstrate my ability to navigate complex codebases.",
    "I am excited about the opportunity to bring this focus to your team.",
    "Thank you for your time and consideration.",
  ];

  for (const sentence of CONNECTIVES) {
    it(`passes: "${sentence}"`, () => {
      expect(check(sentence).fabrication_check).toBe("pass");
    });
  }

  it("passes a full letter assembled from connectives around grounded proof points", () => {
    const letter = [
      "Dear Hiring Team,",
      "My experience is defined by two key technical contributions.",
      "I contributed KubeArmor eBPF runtime security policies.",
      "My Krkn chaos engineering work shows Kubernetes capability.",
      "I am excited about the opportunity to bring this focus to your team.",
      "Thank you for your time and consideration.",
    ].join(" ");
    const result = check(letter);
    expect(result.fabrication_check).toBe("pass");
    expect(result.flagged_sentences).toEqual([]);
  });
});

describe("checkFabrication — puffery hard rule", () => {
  it('flags "extensive experience leading large teams" (two untraceable puffery phrases)', () => {
    const result = check("I have extensive experience leading large teams.");
    expect(result.fabrication_check).toBe("flag");
  });

  it("flags seasoned/veteran/track-record puffery", () => {
    expect(check("A seasoned veteran with a proven track record.").fabrication_check).toBe("flag");
    expect(check("My track record speaks for itself.").fabrication_check).toBe("flag");
  });

  it("flags single-handedly and spearheaded", () => {
    expect(check("I single-handedly rebuilt the stack.").fabrication_check).toBe("flag");
    expect(check("I spearheaded the security effort.").fabrication_check).toBe("flag");
  });

  it("flags digit-less experience claims the YoE regex cannot see", () => {
    expect(check("I bring many years of experience.").fabrication_check).toBe("flag");
    expect(check("After several years in security, I am ready.").fabrication_check).toBe("flag");
  });

  it("tolerates hyphen/space variation (world class == world-class)", () => {
    expect(check("I deliver world class engineering.").fabrication_check).toBe("flag");
    expect(check("I deliver world-class engineering.").fabrication_check).toBe("flag");
  });

  it("passes a puffery phrase that IS verbatim in the base resume (traceable)", () => {
    const honestBase = makeBaseResume({
      summary: "Cloud native engineer with extensive experience in Kubernetes security and eBPF.",
    });
    const result = checkFabrication(
      "I have extensive experience in Kubernetes security.",
      honestBase,
      INVENTORY,
      opportunity,
      roleDescription
    );
    expect(result.fabrication_check).toBe("pass");
  });
});

describe("checkFabrication — narrowed token rule (connective stopwords never count)", () => {
  it("flags at 3 unsupported content tokens (> limit of 2)", () => {
    expect(check("My work on Foobarium includes Quuxinator and Bazzles.").fabrication_check).toBe(
      "flag"
    );
  });

  it("passes at 2 unsupported content tokens (at the limit)", () => {
    expect(check("My work on Foobarium includes Quuxinator.").fabrication_check).toBe("pass");
  });

  it("BORDERLINE: a connective wrapper smuggling one concrete unverifiable claim still flags", () => {
    const result = check("My experience is defined by winning the DEFCON CTF championship.");
    expect(result.fabrication_check).toBe("flag");
  });

  it("stopword-heavy sentences cost nothing regardless of length", () => {
    const result = check(
      "I am genuinely excited and motivated to explore this opportunity together with your team."
    );
    expect(result.fabrication_check).toBe("pass");
  });

  it("citing an evidence record's own URL is not suspicious (URLs are in the corpus)", () => {
    // Without inventory URLs in the corpus, "https/github/com" alone would
    // count 3 content tokens and flag (observed on the AccuKnox run: the
    // krkn PR citation's "pull"/"1425" tokens flagged a true sentence).
    const result = check(
      "I contributed KubeArmor eBPF runtime security policies; see https://github.com/kubearmor/KubeArmor."
    );
    expect(result.fabrication_check).toBe("pass");
  });

  it("ordinal connectives (first/second/third/finally) never count", () => {
    const letter = [
      "First, I contributed KubeArmor eBPF runtime security policies.",
      "Second, my Krkn chaos engineering work shows Kubernetes capability.",
      "Third, I built a React TypeScript site.",
      "Finally, thank you for your time and consideration.",
    ].join(" ");
    const result = check(letter);
    expect(result.fabrication_check).toBe("pass");
    expect(result.flagged_sentences).toEqual([]);
  });
});
