// tests/constraints.test.ts
// Pure draft-intrinsic constraint checks: per-channel length limits, banned
// phrases, and the opener (no-greeting) rule.

import { describe, it, expect } from "vitest";
import { checkConstraints } from "../constraints";
import { BANNED_PHRASES } from "../config";
import { makeDraft, KUBEARMOR_URL } from "./helpers";

describe("length limits", () => {
  it("email: body > 110 words → violation", () => {
    const body = Array(120).fill("kubernetes").join(" ");
    const result = checkConstraints(makeDraft("email", body, "eBPF role"), "email");
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.includes("110 words"))).toBe(true);
  });

  it("email: subject > 10 words → violation", () => {
    const subject = Array(12).fill("eBPF").join(" ");
    const result = checkConstraints(makeDraft("email", "Cilium dataplane internals are elegant.", subject), "email");
    expect(result.violations.some((v) => v.includes("subject exceeds 10 words"))).toBe(true);
  });

  it("email: body AND subject both over → two violations", () => {
    const body = Array(120).fill("kubernetes").join(" ");
    const subject = Array(12).fill("eBPF").join(" ");
    const result = checkConstraints(makeDraft("email", body, subject), "email");
    expect(result.violations.some((v) => v.includes("110 words"))).toBe(true);
    expect(result.violations.some((v) => v.includes("subject exceeds 10 words"))).toBe(true);
  });

  it("linkedin_connect: > 300 chars → violation", () => {
    const body = "Cilium " + "x".repeat(350);
    const result = checkConstraints(makeDraft("linkedin_connect", body), "linkedin_connect");
    expect(result.violations.some((v) => v.includes("300 chars"))).toBe(true);
  });

  it("linkedin_dm: > 80 words → violation", () => {
    const body = Array(90).fill("kubernetes").join(" ");
    const result = checkConstraints(makeDraft("linkedin_dm", body), "linkedin_dm");
    expect(result.violations.some((v) => v.includes("80 words"))).toBe(true);
  });
});

describe("banned phrases (hard regex gate)", () => {
  const sample = [
    "pick your brain",
    "passionate about",
    "just following up",
    "hope this finds you well",
    "I'd love to",
    "circle back",
  ];

  for (const phrase of sample) {
    it(`detects "${phrase}"`, () => {
      const body = `Cilium eBPF work is strong. ${phrase} sometime. See ${KUBEARMOR_URL}.`;
      const result = checkConstraints(makeDraft("email", body, "eBPF"), "email");
      expect(result.pass).toBe(false);
      expect(result.violations.some((v) => v.toLowerCase().includes("banned phrase"))).toBe(true);
    });
  }

  it("the sampled phrases are all in the banned list", () => {
    for (const p of sample) expect(BANNED_PHRASES).toContain(p.toLowerCase());
  });
});

describe("opener (first word must not be a greeting)", () => {
  it('"Hello ..." → violation', () => {
    const result = checkConstraints(makeDraft("email", "Hello, I saw your eBPF work.", "eBPF"), "email");
    expect(result.violations.some((v) => v.includes("greeting"))).toBe(true);
  });

  it("a technical opener passes the opener check", () => {
    const result = checkConstraints(makeDraft("email", "Cilium dataplane internals are elegant.", "eBPF"), "email");
    expect(result.violations.some((v) => v.includes("greeting"))).toBe(false);
  });

  it('"High availability ..." does NOT trigger (exact first-word match only)', () => {
    const result = checkConstraints(makeDraft("email", "High availability in Cilium is hard.", "eBPF"), "email");
    expect(result.violations.some((v) => v.includes("greeting"))).toBe(false);
  });
});

describe("clean draft", () => {
  it("passes all intrinsic constraints", () => {
    const result = checkConstraints(
      makeDraft("email", "Cilium eBPF dataplane work is strong. We could collaborate.", "eBPF security"),
      "email"
    );
    expect(result.pass).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
