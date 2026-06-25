// tests/draft.test.ts
// Orchestration: evidence referencing, regeneration budget, github no-
// opportunity path, customization notes, and prompt purity. Gemini mocked.

import { describe, it, expect } from "vitest";
import { buildOutreachDraft } from "../draft";
import { buildEmailPrompt, buildPrompt } from "../prompts";
import {
  makeRequest,
  makeMatch,
  jsonClient,
  countingClient,
  CLEAN_EMAIL,
  BANNED_EMAIL,
  KUBEARMOR_URL,
} from "./helpers";

const SPARSE_BODY =
  "Your eBPF runtime security work stood out. I have shipped Kubernetes security policies and can help. Could we discuss the role at Isovalent?";

describe("evidence referencing", () => {
  it("ranked non-empty → evidence_referenced = ranked[0].id, constraint_pass", async () => {
    const draft = await buildOutreachDraft(makeRequest("email"), { client: jsonClient(CLEAN_EMAIL) });
    expect(draft.evidence_referenced).toBe("kubearmor");
    expect(draft.constraint_pass).toBe(true);
  });

  it("ranked empty (sparse) → evidence_referenced = null, no URL required", async () => {
    const draft = await buildOutreachDraft(makeRequest("email", { match: makeMatch([]) }), {
      client: jsonClient({ subject: "eBPF role", body: SPARSE_BODY }),
    });
    expect(draft.evidence_referenced).toBeNull();
    expect(draft.constraint_pass).toBe(true);
    expect(draft.customization_notes).toContain("proof is thin");
  });

  it("referencing a second inventory asset → evidence violation", async () => {
    const body = `Your eBPF work is strong. See ${KUBEARMOR_URL} and https://devjaiswal.me for context.`;
    const draft = await buildOutreachDraft(makeRequest("email"), {
      client: jsonClient({ subject: "eBPF role", body }),
    });
    expect(draft.constraint_pass).toBe(false);
    expect(draft.constraint_violations.some((v) => v.includes("another inventory asset"))).toBe(true);
  });
});

describe("regeneration budget (≤2 calls)", () => {
  it("regenerates once on a banned-phrase draft, then accepts the clean retry", async () => {
    const { client, state } = countingClient((call) => (call === 1 ? BANNED_EMAIL : CLEAN_EMAIL));
    const draft = await buildOutreachDraft(makeRequest("email"), { client });
    expect(state.calls).toBe(2);
    expect(draft.constraint_pass).toBe(true);
  });

  it("persistent failure → constraint_pass=false after exactly 2 calls", async () => {
    const { client, state } = countingClient(() => BANNED_EMAIL);
    const draft = await buildOutreachDraft(makeRequest("email"), { client });
    expect(state.calls).toBe(2);
    expect(draft.constraint_pass).toBe(false);
    expect(draft.constraint_violations.length).toBeGreaterThanOrEqual(1);
  });
});

describe("github channel", () => {
  it("has_genuine_opportunity=false → special draft, no regeneration", async () => {
    const { client, state } = countingClient(() => ({ has_genuine_opportunity: false, body: "" }));
    const draft = await buildOutreachDraft(makeRequest("github"), { client });
    expect(state.calls).toBe(1);
    expect(draft.constraint_pass).toBe(false);
    expect(draft.body).toBe("");
    expect(draft.evidence_referenced).toBeNull();
    expect(draft.constraint_violations).toContain("github: no genuine technical opportunity");
    expect(draft.customization_notes.toLowerCase()).toContain("different channel");
  });

  it("has_genuine_opportunity=true → a normal constrained draft", async () => {
    const body = `Your KubeArmor eBPF policy path looks racy under load. I fixed a similar issue; see ${KUBEARMOR_URL} for context.`;
    const { client, state } = countingClient(() => ({ has_genuine_opportunity: true, body }));
    const draft = await buildOutreachDraft(makeRequest("github"), { client });
    expect(state.calls).toBe(1);
    expect(draft.constraint_pass).toBe(true);
    expect(draft.evidence_referenced).toBe("kubearmor");
  });
});

describe("customization_notes", () => {
  it("is always populated (non-empty) for a normal draft", async () => {
    const draft = await buildOutreachDraft(makeRequest("email"), { client: jsonClient(CLEAN_EMAIL) });
    expect(draft.customization_notes.length).toBeGreaterThan(0);
    expect(draft.customization_notes).toContain("Verify");
  });
});

describe("prompt purity", () => {
  it("buildEmailPrompt is pure (same input → same output)", () => {
    const req = makeRequest("email");
    const proof = { evidence: req.inventory[0], reason: "proves eBPF security" };
    expect(buildEmailPrompt(req, proof)).toBe(buildEmailPrompt(req, proof));
  });

  it("does not mutate the request", () => {
    const req = makeRequest("github");
    const snapshot = JSON.parse(JSON.stringify(req));
    buildPrompt(req, null);
    expect(req).toEqual(snapshot);
  });

  it("the github prompt asks for has_genuine_opportunity", () => {
    expect(buildPrompt(makeRequest("github"), null)).toContain("has_genuine_opportunity");
  });
});
