// tests/package.test.ts
// Orchestration: cover-letter tone, regeneration budget, persistent flag,
// sparse-evidence path, evidence_cited, word-cap enforcement, and the
// never-assert guard. Gemini mocked throughout.

import { describe, it, expect } from "vitest";
import { buildApplicationPackage } from "../package";
import { buildCoverLetterPrompt, toneFor } from "../prompt";
import { wordCount } from "../letter";
import {
  makeRequest,
  makeMatch,
  makeOpportunity,
  jsonLetterClient,
  countingClient,
  CLEAN_LETTER,
  FLAGGED_LETTER,
  SEMANTIC_OK,
} from "./helpers";

describe("tone by category", () => {
  it("startup → builder tone in the prompt", () => {
    const req = makeRequest({ opportunity: makeOpportunity("Startup") });
    const prompt = buildCoverLetterPrompt(req, []);
    expect(prompt.toLowerCase()).toContain("builder");
    expect(toneFor("Startup").toLowerCase()).toContain("builder");
  });

  it("non-startup → credentialed tone in the prompt", () => {
    const req = makeRequest({ opportunity: makeOpportunity("Job") });
    const prompt = buildCoverLetterPrompt(req, []);
    expect(prompt.toLowerCase()).toContain("credentialed");
  });
});

describe("buildApplicationPackage — happy path", () => {
  it("returns a passing package with the right evidence cited (3 Gemini calls: draft + critic + semantic)", async () => {
    // call 1 = draft, call 2 = critic (letter-shaped → 0 edits), call 3 = semantic audit.
    const { client, state } = countingClient((call) =>
      call === 3 ? SEMANTIC_OK : JSON.stringify({ letter: CLEAN_LETTER })
    );
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(pkg.fabrication_check).toBe("pass");
    expect(pkg.evidence_cited).toEqual(["kubearmor", "krkn-chaos"]);
    expect(state.calls).toBe(3);
    expect(pkg.notes).not.toContain("proof thin");
    expect(pkg.notes).not.toContain("degraded");
  });

  it("every evidence_cited id exists in the match ranked set", async () => {
    const req = makeRequest();
    const pkg = await buildApplicationPackage(req, { client: jsonLetterClient(CLEAN_LETTER) });
    const rankedIds = req.match.ranked.map((r) => r.evidence_id);
    for (const id of pkg.evidence_cited) expect(rankedIds).toContain(id);
  });
});

describe("regeneration budget (≤5 calls: draft + critic + semantic + one regen + semantic re-check)", () => {
  it("regenerates once on a flagged letter, then accepts the clean retry", async () => {
    // 1 = draft (flagged), 2 = critic (no edits), 3 = semantic (clean verdict;
    // Layer 1 flags regardless), 4 = regen (clean), 5 = semantic re-check.
    const { client, state } = countingClient((call) => {
      if (call === 3 || call === 5) return SEMANTIC_OK;
      if (call === 2) return JSON.stringify({ edits: [] });
      return JSON.stringify({ letter: call === 1 ? FLAGGED_LETTER : CLEAN_LETTER });
    });
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(5);
    expect(pkg.fabrication_check).toBe("pass");
  });

  it("persistent fabrication → flag after exactly 5 calls, never a loop", async () => {
    const { client, state } = countingClient((call) => {
      if (call === 3 || call === 5) return SEMANTIC_OK;
      if (call === 2) return JSON.stringify({ edits: [] });
      if (call > 5) throw new Error(`unexpected Gemini call #${call}`);
      return JSON.stringify({ letter: FLAGGED_LETTER });
    });
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(5);
    expect(pkg.fabrication_check).toBe("flag");
    expect(pkg.flagged_sentences.length).toBeGreaterThanOrEqual(1);
    expect(pkg.notes).toContain("fabrication check flagged");
  });
});

describe("semantic-layer degradation is visible on the approval surface (notes)", () => {
  it("garbage semantic verdict → fail-closed pass, degradation named in notes", async () => {
    // 1 = draft (clean), 2 = critic (no edits), 3 = semantic returns garbage.
    const { client, state } = countingClient((call) => {
      if (call === 1) return JSON.stringify({ letter: CLEAN_LETTER });
      if (call === 2) return JSON.stringify({ edits: [] });
      return "TOTALLY NOT JSON";
    });
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(3);
    expect(pkg.fabrication_check).toBe("pass"); // Layer-1 result stands
    expect(pkg.notes).toContain("semantic layer degraded");
    expect(pkg.notes).toContain("verify claims manually");
  });
});

describe("never-assert guard", () => {
  it("a base resume without a Staff title cannot yield a clean 'Staff Engineer' letter", async () => {
    const client = jsonLetterClient("I am a Staff Engineer with deep eBPF security expertise.");
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(pkg.fabrication_check).toBe("flag");
  });
});

describe("sparse evidence", () => {
  it("empty ranked → notes warns proof thin, evidence_cited empty, fabrication still runs", async () => {
    const req = makeRequest({ match: makeMatch([]) });
    const pkg = await buildApplicationPackage(req, { client: jsonLetterClient(CLEAN_LETTER) });
    expect(pkg.evidence_cited).toEqual([]);
    expect(pkg.notes).toContain("proof thin");
    expect(pkg.fabrication_check).toBe("pass");
  });
});

describe("word-cap enforcement (≤250)", () => {
  it("regenerates then hard-truncates an over-long letter to ≤250 words", async () => {
    const longLetter = Array(300).fill("Kubernetes").join(" ");
    const { client, state } = countingClient((call) => {
      if (call === 3 || call === 5) return SEMANTIC_OK;
      if (call === 2) return JSON.stringify({ edits: [] });
      return JSON.stringify({ letter: longLetter });
    });
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(5);
    expect(wordCount(pkg.cover_letter)).toBeLessThanOrEqual(250);
    expect(pkg.notes).toContain("truncated to 250 words");
  });
});
