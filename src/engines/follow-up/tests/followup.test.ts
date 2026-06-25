// tests/followup.test.ts
// Orchestration: per-step word caps with regeneration, banned phrases, new
// evidence in the prompt, the LinkedIn channel-switch note, and the terminal
// no-Gemini-call guarantee. Gemini mocked.

import { describe, it, expect } from "vitest";
import { buildFollowUp } from "../followup";
import { buildFollowUpPrompt, checkFollowUpConstraints } from "../prompts";
import {
  NEW_EVIDENCE,
  CLEAN_FU1,
  CLEAN_FU2,
  CLEAN_FU3,
  makeRequest,
  jsonClient,
  countingClient,
} from "./helpers";

const NOW = new Date("2026-06-10T00:00:00.000Z");

describe("per-step word caps with one regeneration", () => {
  it("FU1 ≤60: over-long → regenerate once → ≤60, exactly 2 calls", async () => {
    const long = Array(70).fill("kubernetes").join(" ");
    const { client, state } = countingClient((call) => (call === 1 ? long : CLEAN_FU1));
    const result = await buildFollowUp(makeRequest({ step: 0 }), { client, now: NOW });
    expect(state.calls).toBe(2);
    expect(result.draft?.constraint_pass).toBe(true);
    expect(result.draft!.word_count).toBeLessThanOrEqual(60);
  });

  it("FU2 ≤50: over-long → regenerate once → ≤50", async () => {
    const long = Array(60).fill("kubernetes").join(" ");
    const { client } = countingClient((call) => (call === 1 ? long : CLEAN_FU2));
    const result = await buildFollowUp(makeRequest({ step: 1 }), { client, now: NOW });
    expect(result.draft?.constraint_pass).toBe(true);
    expect(result.draft!.word_count).toBeLessThanOrEqual(50);
  });

  it("FU3 ≤40: over-long → regenerate once → ≤40", async () => {
    const long = Array(50).fill("kubernetes").join(" ");
    const { client } = countingClient((call) => (call === 1 ? long : CLEAN_FU3));
    const result = await buildFollowUp(makeRequest({ step: 2 }), { client, now: NOW });
    expect(result.draft?.constraint_pass).toBe(true);
    expect(result.draft!.word_count).toBeLessThanOrEqual(40);
  });
});

describe("banned phrases (FU-specific)", () => {
  it('"just following up" → constraint_pass=false after 2 calls', async () => {
    const { client, state } = countingClient(() => "Just following up on the eBPF role. Any update for me?");
    const result = await buildFollowUp(makeRequest({ step: 0 }), { client, now: NOW });
    expect(state.calls).toBe(2);
    expect(result.draft?.constraint_pass).toBe(false);
  });

  it('"bumping this" is flagged by the constraint check', () => {
    const cr = checkFollowUpConstraints("Bumping this thread on the eBPF role briefly.", 1);
    expect(cr.pass).toBe(false);
    expect(cr.violations.some((v) => v.includes("bumping this"))).toBe(true);
  });
});

describe("new evidence", () => {
  it("FU1 prompt includes the new evidence title", () => {
    const prompt = buildFollowUpPrompt(makeRequest({ step: 0, new_evidence: NEW_EVIDENCE }), 1);
    expect(prompt).toContain(NEW_EVIDENCE.title);
  });

  it("evidence_referenced = new_evidence.id when present", async () => {
    const result = await buildFollowUp(
      makeRequest({ step: 0, new_evidence: NEW_EVIDENCE }),
      { client: jsonClient(CLEAN_FU1), now: NOW }
    );
    expect(result.draft?.evidence_referenced).toBe(NEW_EVIDENCE.id);
  });
});

describe("LinkedIn channel-switch note (FU2)", () => {
  it("LinkedIn no-reply at step 1 → FU2 notes recommend switching to email", async () => {
    const result = await buildFollowUp(
      makeRequest({ step: 1, channel: "linkedin_dm" }),
      { client: jsonClient(CLEAN_FU2), now: NOW }
    );
    expect(result.step).toBe(2);
    expect(result.draft?.customization_notes.toLowerCase()).toContain("email");
    expect(result.draft?.customization_notes.toLowerCase()).toContain("switch");
  });

  it("email channel does not add a channel-switch note", async () => {
    const result = await buildFollowUp(
      makeRequest({ step: 1, channel: "email" }),
      { client: jsonClient(CLEAN_FU2), now: NOW }
    );
    expect(result.draft?.customization_notes.toLowerCase()).not.toContain("switching to email");
  });
});

describe("terminal → no draft, no Gemini call", () => {
  it("Replied → terminal state, draft null, zero Gemini calls", async () => {
    const { client, state } = countingClient(() => "should not be called");
    const result = await buildFollowUp(makeRequest({ step: 1, status: "Replied" }), { client, now: NOW });
    expect(result.terminal).toBe(true);
    expect(result.draft).toBeNull();
    expect(state.calls).toBe(0);
  });

  it("OSS step 2 → terminal, draft null, zero Gemini calls", async () => {
    const { client, state } = countingClient(() => "should not be called");
    const req = makeRequest({ step: 2 });
    req.opportunity.category = "OSS";
    const result = await buildFollowUp(req, { client, now: NOW });
    expect(result.terminal).toBe(true);
    expect(result.draft).toBeNull();
    expect(state.calls).toBe(0);
  });
});

describe("customization_notes", () => {
  it("is always populated", async () => {
    const result = await buildFollowUp(makeRequest({ step: 0 }), { client: jsonClient(CLEAN_FU1), now: NOW });
    expect(result.draft!.customization_notes.length).toBeGreaterThan(0);
    expect(result.draft!.customization_notes).toContain("Verify");
  });
});
