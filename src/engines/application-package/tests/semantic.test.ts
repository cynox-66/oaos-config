// tests/semantic.test.ts
// Layer 2 (semantic audit) + the layered composer. THE INVARIANT under test:
// Layer 2 can escalate a Layer-1 pass to a flag, but can NEVER clear a
// Layer-1 flag, and an LLM failure NEVER produces a silent pass (fail-closed:
// the result degrades to the Layer-1 verdict with semantic_degraded=true).

import { describe, it, expect } from "vitest";
import {
  buildSemanticFabricationPrompt,
  checkFabricationLayered,
  parseSemanticVerdict,
} from "../semantic";
import { checkFabrication, requiresRegen } from "../fabrication";
import type { GeminiClient } from "../types";
import {
  CLEAN_LETTER,
  FLAGGED_LETTER,
  INVENTORY,
  PARAPHRASE_SENTENCE,
  SEMANTIC_OK,
  makeBaseResume,
  makeOpportunity,
} from "./helpers";

const base = makeBaseResume();
const opportunity = makeOpportunity();
const roleDescription = "Work on eBPF security for Kubernetes.";

const layered = (letter: string, client: GeminiClient) =>
  checkFabricationLayered(letter, base, INVENTORY, opportunity, roleDescription, client);

/** A client whose single generate() returns a fixed raw string. */
function rawClient(raw: string): GeminiClient {
  return { async generate() { return raw; } };
}

/** A client whose generate() always throws (transport failure). */
const THROWING_CLIENT: GeminiClient = {
  async generate() {
    throw new Error("gemini transport failure");
  },
};

function verdictWith(sentence: string): string {
  return JSON.stringify({
    unsupported_claims: [{ sentence, claim: "unsupported", reason: "not in sources" }],
  });
}

// ============================================================
// parseSemanticVerdict — null (degraded) vs [] (affirmatively clean)
// ============================================================

describe("parseSemanticVerdict", () => {
  it("parses a valid verdict with claims", () => {
    const parsed = parseSemanticVerdict(verdictWith("Some sentence."));
    expect(parsed).toEqual([
      { sentence: "Some sentence.", claim: "unsupported", reason: "not in sources" },
    ]);
  });

  it("parses an empty verdict as [] — NOT null (clean is not degraded)", () => {
    expect(parseSemanticVerdict(SEMANTIC_OK)).toEqual([]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const raw = 'Sure:\n```json\n{"unsupported_claims":[]}\n```';
    expect(parseSemanticVerdict(raw)).toEqual([]);
  });

  it("returns null on garbage (degraded, never a fabricated clean verdict)", () => {
    expect(parseSemanticVerdict("TOTALLY NOT JSON")).toBeNull();
    expect(parseSemanticVerdict("")).toBeNull();
  });

  it("returns null on wrong shapes", () => {
    expect(parseSemanticVerdict(JSON.stringify({ letter: "a whole letter" }))).toBeNull();
    expect(parseSemanticVerdict(JSON.stringify({ unsupported_claims: "nope" }))).toBeNull();
    expect(parseSemanticVerdict(JSON.stringify({ unsupported_claims: [{ claim: "no sentence" }] }))).toBeNull();
    expect(parseSemanticVerdict(JSON.stringify({ unsupported_claims: [{ sentence: "" }] }))).toBeNull();
    expect(parseSemanticVerdict(JSON.stringify([]))).toBeNull();
  });
});

// ============================================================
// buildSemanticFabricationPrompt — complete allowed sources
// ============================================================

describe("buildSemanticFabricationPrompt", () => {
  it("contains the letter, the FULL base resume, the inventory, and the output contract", () => {
    const prompt = buildSemanticFabricationPrompt(CLEAN_LETTER, base, INVENTORY, opportunity, roleDescription);
    expect(prompt).toContain(CLEAN_LETTER);
    expect(prompt).toContain(base.name);
    // Full serialization: every project must be visible to the auditor,
    // not a top-N truncation.
    for (const p of base.projects) expect(prompt).toContain(p.name);
    expect(prompt).toContain(INVENTORY[0].title);
    expect(prompt).toContain(opportunity.company);
    expect(prompt).toContain('"unsupported_claims"');
    expect(prompt).toContain("NOT violations");
  });

  it("instructs the auditor that all sources are co-equal (no base-resume primacy)", () => {
    // Regression pin for the AccuKnox run's Layer-2 false positive: the
    // auditor flagged an inventory-supported claim because it invented a
    // "base resume is primary" hierarchy.
    const prompt = buildSemanticFabricationPrompt(CLEAN_LETTER, base, INVENTORY, opportunity, roleDescription);
    expect(prompt).toContain("equally authoritative");
    expect(prompt).toContain("ANY");
    expect(prompt).toContain("Do NOT treat the base resume as primary");
  });
});

// ============================================================
// checkFabricationLayered — the invariant
// ============================================================

describe("checkFabricationLayered — INVARIANT (d): Layer 2 escalates a Layer-1 pass", () => {
  it("flags when the auditor names an unsupported claim in a Layer-1-clean letter", async () => {
    const target = "My Krkn chaos engineering work shows Kubernetes capability.";
    // Precondition: Layer 1 alone passes this letter.
    expect(checkFabrication(CLEAN_LETTER, base, INVENTORY, opportunity, roleDescription).fabrication_check).toBe("pass");

    const result = await layered(CLEAN_LETTER, rawClient(verdictWith(target)));
    expect(result.fabrication_check).toBe("flag");
    expect(result.flagged_sentences).toContain(target);
    expect(result.semantic_degraded).toBe(false);
  });
});

describe("checkFabricationLayered — INVARIANT (f): Layer 2 can NEVER clear a Layer-1 flag", () => {
  it('still flags an 8+ years/title letter when the auditor says "everything is fine"', async () => {
    const hard = checkFabrication(FLAGGED_LETTER, base, INVENTORY, opportunity, roleDescription);
    expect(hard.fabrication_check).toBe("flag"); // precondition: the floor flags

    const result = await layered(FLAGGED_LETTER, rawClient(SEMANTIC_OK));
    expect(result.fabrication_check).toBe("flag");
    // Every hard flag survives the union untouched.
    for (const s of hard.flagged_sentences) expect(result.flagged_sentences).toContain(s);
    expect(result.semantic_degraded).toBe(false);
  });

  it("dedupes when both layers name the same sentence", async () => {
    const hard = checkFabrication(FLAGGED_LETTER, base, INVENTORY, opportunity, roleDescription);
    const dup = hard.flagged_sentences[0];
    const result = await layered(FLAGGED_LETTER, rawClient(verdictWith(dup)));
    expect(result.flagged_sentences.filter((s) => s === dup)).toHaveLength(1);
  });
});

describe("checkFabricationLayered — FAIL-CLOSED (e): LLM failure never silently passes", () => {
  it("transport error on a clean letter → Layer-1 pass, loudly marked degraded", async () => {
    const result = await layered(CLEAN_LETTER, THROWING_CLIENT);
    expect(result.fabrication_check).toBe("pass");
    expect(result.semantic_degraded).toBe(true);
  });

  it("unparseable verdict on a clean letter → Layer-1 pass, marked degraded", async () => {
    const result = await layered(CLEAN_LETTER, rawClient("TOTALLY NOT JSON"));
    expect(result.fabrication_check).toBe("pass");
    expect(result.semantic_degraded).toBe(true);
  });

  it("Layer 1 flagged and Layer 2 errors → STILL FLAGS (an outage cannot unflag)", async () => {
    const result = await layered(FLAGGED_LETTER, THROWING_CLIENT);
    expect(result.fabrication_check).toBe("flag");
    expect(result.flagged_sentences.length).toBeGreaterThanOrEqual(1);
    expect(result.semantic_degraded).toBe(true);
  });

  it("clean letter + affirmatively clean verdict → pass, NOT degraded", async () => {
    const result = await layered(CLEAN_LETTER, rawClient(SEMANTIC_OK));
    expect(result.fabrication_check).toBe("pass");
    expect(result.flagged_sentences).toEqual([]);
    expect(result.semantic_degraded).toBe(false);
  });
});

// ============================================================
// regen routing (#11) — review-only through the layered composer
// ============================================================

describe("checkFabricationLayered — review-only survival and promotion", () => {
  const letter = `${CLEAN_LETTER} ${PARAPHRASE_SENTENCE}`;

  it("net 4 alone + clean semantic verdict → flag retained as review-only, NO regen", async () => {
    const result = await layered(letter, rawClient(SEMANTIC_OK));
    expect(result.fabrication_check).toBe("flag");
    expect(result.flagged_sentences).toEqual([PARAPHRASE_SENTENCE]);
    expect(result.review_only_sentences).toEqual([PARAPHRASE_SENTENCE]);
    expect(requiresRegen(result)).toBe(false);
  });

  it("net 5 naming the SAME sentence net 4 flagged → promoted out of review-only, regen fires", async () => {
    const result = await layered(letter, rawClient(verdictWith(PARAPHRASE_SENTENCE)));
    expect(result.flagged_sentences).toEqual([PARAPHRASE_SENTENCE]);
    expect(result.review_only_sentences).toEqual([]);
    expect(requiresRegen(result)).toBe(true);
  });

  it("net 5 alone (Layer-1-clean letter) → hard flag, regen fires (explicit net-5 case)", async () => {
    const flaggedSentence = "My Krkn chaos engineering work shows Kubernetes capability.";
    const result = await layered(CLEAN_LETTER, rawClient(verdictWith(flaggedSentence)));
    expect(result.flagged_sentences).toEqual([flaggedSentence]);
    expect(result.review_only_sentences).toEqual([]);
    expect(requiresRegen(result)).toBe(true);
  });

  it("Q2 Option A: net 4 alone + DEGRADED semantic layer → still review-only, no regen, loudly degraded", async () => {
    const result = await layered(letter, THROWING_CLIENT);
    expect(result.fabrication_check).toBe("flag");
    expect(result.review_only_sentences).toEqual([PARAPHRASE_SENTENCE]);
    expect(result.semantic_degraded).toBe(true); // visibility is what makes A safe
    expect(requiresRegen(result)).toBe(false);
  });

  it("hard Layer-1 flags are never review-only regardless of the semantic verdict", async () => {
    const result = await layered(FLAGGED_LETTER, rawClient(SEMANTIC_OK));
    expect(result.fabrication_check).toBe("flag");
    expect(result.review_only_sentences).toEqual([]);
    expect(requiresRegen(result)).toBe(true);
  });
});
