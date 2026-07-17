// tests/resume.test.ts
// Regression tests for the read-only structured Engine-6 inputs:
//  - the real resume/base_resume.json + resume/operator_profile.json load and
//    validate cleanly into BaseResume / OperatorProfile;
//  - malformed values throw ResumeValidationError with the exact offending path.

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  loadBaseResume,
  loadOperatorProfile,
  parseBaseResume,
  parseOperatorProfile,
  ResumeValidationError,
} from "../resume";

const ROOT = resolve(__dirname, "../..");

describe("real resume JSON files load + validate", () => {
  it("resume/base_resume.json deserializes into a BaseResume", () => {
    const r = loadBaseResume(resolve(ROOT, "resume/base_resume.json"));
    expect(r.name).toBe("Dev Jaiswal");
    expect(r.experience.length).toBeGreaterThan(0);
    expect(r.projects.length).toBeGreaterThan(0);
    expect(r.skills.length).toBeGreaterThan(0);
    // Every experience/project entry is fully typed.
    for (const e of r.experience) {
      expect(typeof e.company).toBe("string");
      expect(Array.isArray(e.bullets)).toBe(true);
    }
    for (const p of r.projects) {
      expect(typeof p.name).toBe("string");
      expect(Array.isArray(p.tech_tags)).toBe(true);
    }
  });

  it("resume/operator_profile.json deserializes into an OperatorProfile", () => {
    const o = loadOperatorProfile(resolve(ROOT, "resume/operator_profile.json"));
    expect(o.name).toBe("Dev Jaiswal");
    expect(o.github).toBe("cynox-66");
    expect(o.portfolio_url).toBe("https://devjaiswal.me");
    expect(o.stack.length).toBeGreaterThan(0);
  });
});

describe("parseBaseResume strict validation", () => {
  const valid = {
    name: "X",
    summary: "s",
    experience: [{ company: "c", title: "t", dates: "d", bullets: ["b"] }],
    projects: [{ name: "n", description: "d", bullets: [], tech_tags: [] }],
    education: [{ institution: "i", degree: "deg", dates: "d" }],
    skills: ["s"],
  };

  it("accepts a well-formed object (url optional)", () => {
    expect(() => parseBaseResume(valid)).not.toThrow();
  });

  it("accepts an optional project url when present", () => {
    const withUrl = { ...valid, projects: [{ ...valid.projects[0], url: "https://x" }] };
    expect(parseBaseResume(withUrl).projects[0].url).toBe("https://x");
  });

  it("throws with the exact path on a wrong-typed nested field", () => {
    const bad = { ...valid, experience: [{ company: "c", title: "t", dates: "d", bullets: [1] }] };
    expect(() => parseBaseResume(bad)).toThrowError(ResumeValidationError);
    expect(() => parseBaseResume(bad)).toThrowError(/experience\[0\]\.bullets\[0\]: expected string/);
  });

  it("throws on a missing required field", () => {
    const { summary, ...noSummary } = valid;
    expect(() => parseBaseResume(noSummary)).toThrowError(/base_resume\.summary: expected string/);
  });
});

describe("parseOperatorProfile strict validation", () => {
  it("throws with the exact path on a bad stack entry", () => {
    const bad = { name: "n", github: "g", portfolio_url: "p", stack: ["ok", 5] };
    expect(() => parseOperatorProfile(bad)).toThrowError(/operator_profile\.stack\[1\]: expected string/);
  });
});
