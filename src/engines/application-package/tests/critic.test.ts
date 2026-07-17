// tests/critic.test.ts
// Reviewer pass (D8): critic prompt/parse/apply pure units, plus the flow
// tests — sharpening happy path, the LOAD-BEARING safety test (a critic edit
// that injects an unverifiable claim MUST be flagged by the fabrication
// trace-check on the final package), graceful degradation on unparseable
// critic output, and the exact call budget (2 happy / 3 worst, never a loop).

import { describe, it, expect } from "vitest";
import { buildApplicationPackage } from "../package";
import { buildCriticPrompt, parseCriticEdits, applyEdits } from "../critic";
import { makeRequest, countingClient, CLEAN_LETTER, INVENTORY } from "./helpers";

// ============================================================
// Pure units
// ============================================================

describe("parseCriticEdits", () => {
  it("parses a valid edits array", () => {
    const raw = JSON.stringify({
      edits: [{ old: "a generic line.", new: "a specific line.", reason: "sharper" }],
    });
    expect(parseCriticEdits(raw)).toEqual([
      { old: "a generic line.", new: "a specific line.", reason: "sharper" },
    ]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const raw = 'Here you go:\n```json\n{ "edits": [ { "old": "x y z", "new": "p q r" } ] }\n```';
    expect(parseCriticEdits(raw)).toEqual([{ old: "x y z", new: "p q r" }]);
  });

  it("degrades to zero edits on garbage, wrong shape, or a letter-shaped response", () => {
    expect(parseCriticEdits("TOTALLY NOT JSON")).toEqual([]);
    expect(parseCriticEdits(JSON.stringify({ edits: "nope" }))).toEqual([]);
    expect(parseCriticEdits(JSON.stringify({ letter: "a whole letter" }))).toEqual([]);
    expect(parseCriticEdits("")).toEqual([]);
  });

  it("filters invalid entries (empty old, non-string fields, no-op edits)", () => {
    const raw = JSON.stringify({
      edits: [
        { old: "", new: "something" },
        { old: 42, new: "something" },
        { old: "same text", new: "same text" },
        { old: "keep me.", new: "kept, sharper." },
      ],
    });
    expect(parseCriticEdits(raw)).toEqual([{ old: "keep me.", new: "kept, sharper." }]);
  });
});

describe("applyEdits", () => {
  it("applies matching edits and skips non-matching ones, counting only applied", () => {
    const letter = "First sentence. Second sentence.";
    const { letter: revised, applied } = applyEdits(letter, [
      { old: "Second sentence.", new: "A sharper second sentence." },
      { old: "Not in the letter.", new: "irrelevant" },
    ]);
    expect(revised).toBe("First sentence. A sharper second sentence.");
    expect(applied).toBe(1);
  });

  it("zero edits → letter unchanged", () => {
    const { letter, applied } = applyEdits(CLEAN_LETTER, []);
    expect(letter).toBe(CLEAN_LETTER);
    expect(applied).toBe(0);
  });
});

describe("buildCriticPrompt", () => {
  it("contains the draft, the grounding context, and the edits contract", () => {
    const req = makeRequest();
    const prompt = buildCriticPrompt(req, INVENTORY.slice(0, 2), CLEAN_LETTER);
    expect(prompt).toContain(CLEAN_LETTER);
    expect(prompt).toContain(req.opportunity.company);
    expect(prompt).toContain('"edits"');
    expect(prompt).toContain("NEVER add facts");
  });
});

// ============================================================
// Flow (a): critic sharpens a generic draft → final letter passes
// ============================================================

const GENERIC_SENTENCE = "My Krkn chaos engineering work shows Kubernetes capability.";
const SHARPENED_SENTENCE = "My Krkn chaos scenarios prove Kubernetes resilience engineering.";

describe("critic flow — sharpening happy path", () => {
  it("applies a grounded edit, final letter passes, exactly 2 calls (draft + critic)", async () => {
    const { client, state } = countingClient((call) => {
      if (call === 1) return JSON.stringify({ letter: CLEAN_LETTER });
      if (call === 2)
        return JSON.stringify({
          edits: [{ old: GENERIC_SENTENCE, new: SHARPENED_SENTENCE, reason: "more specific" }],
        });
      throw new Error(`unexpected Gemini call #${call}`);
    });

    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(2);
    expect(pkg.cover_letter).toContain(SHARPENED_SENTENCE);
    expect(pkg.cover_letter).not.toContain(GENERIC_SENTENCE);
    expect(pkg.fabrication_check).toBe("pass");
    expect(pkg.notes).toContain("reviewer pass: 1 edit(s) applied.");
  });
});

// ============================================================
// Flow (b): LOAD-BEARING SAFETY TEST — a critic edit injecting an
// unverifiable claim MUST end in fabrication_check === "flag" with the
// offending sentence named. If this test fails, the safety gate is broken.
// ============================================================

const INJECTED_CLAIM =
  "With 8+ years as a principal engineer, I will lead your eBPF security roadmap.";

describe("critic flow — SAFETY: trace-check gates the critic", () => {
  it("critic-injected unverifiable claim → final flag naming the sentence, exactly 3 calls, no loop", async () => {
    const { client, state } = countingClient((call) => {
      // call 1: clean draft.
      if (call === 1) return JSON.stringify({ letter: CLEAN_LETTER });
      // call 2: the critic injects a years-of-experience + title claim.
      if (call === 2)
        return JSON.stringify({
          edits: [
            {
              old: "I want to contribute eBPF security at Isovalent.",
              new: INJECTED_CLAIM,
              reason: "stronger close",
            },
          ],
        });
      // call 3: the one regeneration — the model persists with the bad claim.
      if (call === 3)
        return JSON.stringify({
          letter: `${INJECTED_CLAIM} I contributed KubeArmor eBPF runtime security policies.`,
        });
      // A 4th call would mean a retry loop — the budget forbids it.
      throw new Error(`unexpected Gemini call #${call} — regeneration must not loop`);
    });

    const pkg = await buildApplicationPackage(makeRequest(), { client });

    // The trace-check wins: the final package is flagged, exactly as today.
    expect(pkg.fabrication_check).toBe("flag");
    // The offending sentence is named.
    expect(pkg.flagged_sentences.join(" ")).toContain("8+ years");
    expect(pkg.flagged_sentences.join(" ")).toContain("principal");
    expect(pkg.notes).toContain("fabrication check flagged");
    // Exactly draft + critic + one regeneration; never a loop.
    expect(state.calls).toBe(3);
  });
});

// ============================================================
// Flow (c): graceful degradation — unparseable critic output
// ============================================================

describe("critic flow — graceful degradation", () => {
  it("unparseable critic response → draft proceeds unchanged, still fabrication-checked, 2 calls", async () => {
    const { client, state } = countingClient((call) => {
      if (call === 1) return JSON.stringify({ letter: CLEAN_LETTER });
      if (call === 2) return "TOTALLY NOT JSON";
      throw new Error(`unexpected Gemini call #${call}`);
    });

    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(2);
    expect(pkg.cover_letter).toBe(CLEAN_LETTER);
    expect(pkg.fabrication_check).toBe("pass"); // the check ran on the final text
    expect(pkg.notes).not.toContain("reviewer pass");
  });
});
