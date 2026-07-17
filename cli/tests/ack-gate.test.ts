// tests/ack-gate.test.ts
// #12a — the CLI acknowledgment gate (acknowledgeReviewFlags). All I/O is
// injected (fake Prompter + captured log), so the gate's full decision table is
// unit-testable without a TTY: no flags → no prompt; review-only flags → block
// printed + y/n prompt; y proceeds, n aborts, anything else re-asks.

import { describe, it, expect } from "vitest";
import { acknowledgeReviewFlags } from "../commands/intake";
import type { Prompter } from "../prompts";
import type { ApplicationPackage } from "../../src/engines/application-package/types";

function makePkg(over: Partial<ApplicationPackage> = {}): ApplicationPackage {
  return {
    resume_variant: {
      name: "",
      summary: "",
      experience: [],
      projects: [],
      education: [],
      skills: [],
    },
    cover_letter: "letter",
    evidence_cited: [],
    fabrication_check: "pass",
    flagged_sentences: [],
    review_only_sentences: [],
    semantic_degraded: false,
    notes: "",
    ...over,
  };
}

/** Fake prompter: replays queued answers; throws if asked more than expected. */
function fakePrompter(answers: string[]): { p: Prompter; asks: string[] } {
  const queue = [...answers];
  const asks: string[] = [];
  const p: Prompter = {
    async ask(question: string): Promise<string> {
      asks.push(question);
      if (queue.length === 0) throw new Error("prompter exhausted — unexpected extra prompt");
      return queue.shift()!;
    },
    async askValidated(): Promise<never> {
      throw new Error("askValidated is not used by the gate");
    },
    close(): void {},
  };
  return { p, asks };
}

function capture(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (line) => lines.push(line), lines };
}

describe("acknowledgeReviewFlags (#12a)", () => {
  it("null package (Engine 6 gated off) → proceeds, no prompt, no output", async () => {
    const { p, asks } = fakePrompter([]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(null, p, log)).resolves.toBe(true);
    expect(asks).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("clean package → proceeds, no prompt, no output (no friction without flags)", async () => {
    const { p, asks } = fakePrompter([]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(makePkg(), p, log)).resolves.toBe(true);
    expect(asks).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("hard flags only (regen already fired) → block printed, NO prompt, proceeds", async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["I have 9 years experience."],
    });
    const { p, asks } = fakePrompter([]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(true);
    expect(asks).toEqual([]);
    expect(lines.join("\n")).toContain("HARD fabrication flags");
    expect(lines.join("\n")).toContain("I have 9 years experience.");
  });

  it('review-only flags + "y" → block printed, one prompt, proceeds', async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["A true paraphrase sentence."],
      review_only_sentences: ["A true paraphrase sentence."],
    });
    const { p, asks } = fakePrompter(["y"]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(true);
    expect(asks).toHaveLength(1);
    expect(asks[0]).toContain("(y/n)");
    expect(lines.join("\n")).toContain("REVIEW-ONLY");
    expect(lines.join("\n")).toContain("A true paraphrase sentence.");
  });

  it('review-only flags + "n" → aborts (false), so the caller must skip the write', async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["A true paraphrase sentence."],
      review_only_sentences: ["A true paraphrase sentence."],
    });
    const { p } = fakePrompter(["n"]);
    const { log } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(false);
  });

  it('unrecognized answers re-prompt until y/n; trims and is case-insensitive ("  Y  ")', async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["A true paraphrase sentence."],
      review_only_sentences: ["A true paraphrase sentence."],
    });
    const { p, asks } = fakePrompter(["maybe", "", "  Y  "]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(true);
    expect(asks).toHaveLength(3);
    expect(lines.join("\n")).toContain("Please answer y or n");
  });

  it("mixed hard + review-only → both sections printed, prompt still required", async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["I have 9 years experience.", "A true paraphrase sentence."],
      review_only_sentences: ["A true paraphrase sentence."],
    });
    const { p, asks } = fakePrompter(["y"]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(true);
    expect(asks).toHaveLength(1);
    const out = lines.join("\n");
    expect(out).toContain("HARD fabrication flags");
    expect(out).toContain("REVIEW-ONLY");
  });

  it("Q2: degradation state prints in the SAME block as the review-only flags", async () => {
    const pkg = makePkg({
      fabrication_check: "flag",
      flagged_sentences: ["A true paraphrase sentence."],
      review_only_sentences: ["A true paraphrase sentence."],
      semantic_degraded: true,
    });
    const { p } = fakePrompter(["y"]);
    const { log, lines } = capture();
    await expect(acknowledgeReviewFlags(pkg, p, log)).resolves.toBe(true);
    expect(lines).toHaveLength(1); // ONE log call — one contiguous block
    expect(lines[0]).toContain("REVIEW-ONLY");
    expect(lines[0]).toContain("SEMANTIC AUDIT DEGRADED");
  });
});
