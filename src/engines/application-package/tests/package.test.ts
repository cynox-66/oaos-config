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
  it("returns a passing package with the right evidence cited (1 Gemini call)", async () => {
    const { client, state } = countingClient(() => JSON.stringify({ letter: CLEAN_LETTER }));
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(pkg.fabrication_check).toBe("pass");
    expect(pkg.evidence_cited).toEqual(["kubearmor", "krkn-chaos"]);
    expect(state.calls).toBe(1);
    expect(pkg.notes).not.toContain("proof thin");
  });

  it("every evidence_cited id exists in the match ranked set", async () => {
    const req = makeRequest();
    const pkg = await buildApplicationPackage(req, { client: jsonLetterClient(CLEAN_LETTER) });
    const rankedIds = req.match.ranked.map((r) => r.evidence_id);
    for (const id of pkg.evidence_cited) expect(rankedIds).toContain(id);
  });
});

describe("regeneration budget (≤2 calls)", () => {
  it("regenerates once on a flagged letter, then accepts the clean retry", async () => {
    const { client, state } = countingClient((call) =>
      JSON.stringify({ letter: call === 1 ? FLAGGED_LETTER : CLEAN_LETTER })
    );
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(2);
    expect(pkg.fabrication_check).toBe("pass");
  });

  it("persistent fabrication → flag after exactly 2 calls", async () => {
    const { client, state } = countingClient(() => JSON.stringify({ letter: FLAGGED_LETTER }));
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(2);
    expect(pkg.fabrication_check).toBe("flag");
    expect(pkg.flagged_sentences.length).toBeGreaterThanOrEqual(1);
    expect(pkg.notes).toContain("fabrication check flagged");
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
    const { client, state } = countingClient(() => JSON.stringify({ letter: longLetter }));
    const pkg = await buildApplicationPackage(makeRequest(), { client });
    expect(state.calls).toBe(2);
    expect(wordCount(pkg.cover_letter)).toBeLessThanOrEqual(250);
    expect(pkg.notes).toContain("truncated to 250 words");
  });
});
