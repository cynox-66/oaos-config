// tests/prompts.test.ts
// Unit tests for the PURE input helpers in cli/prompts.ts (F6). The impure
// readline prompter is not exercised here.

import { describe, it, expect } from "vitest";
import {
  validateURL,
  validateMinContributions,
  parseChoice,
  buildManualRawItem,
  type ManualEntry,
} from "../prompts";

describe("validateURL", () => {
  it("accepts empty as a skipped optional value", () => {
    expect(validateURL("")).toEqual({ value: null, error: null });
    expect(validateURL("   ")).toEqual({ value: null, error: null });
  });

  it("accepts and trims a valid http(s) URL", () => {
    expect(validateURL("  https://example.com/x ")).toEqual({
      value: "https://example.com/x",
      error: null,
    });
    expect(validateURL("http://a.co")).toEqual({ value: "http://a.co", error: null });
  });

  it("rejects malformed and non-http URLs", () => {
    expect(validateURL("not a url").value).toBeNull();
    expect(validateURL("not a url").error).toBeTruthy();
    expect(validateURL("ftp://host/x").value).toBeNull();
    expect(validateURL("ftp://host/x").error).toBeTruthy();
  });
});

describe("validateMinContributions", () => {
  it("accepts positive integers", () => {
    expect(validateMinContributions("3")).toEqual({ value: 3, error: null });
    expect(validateMinContributions(" 10 ")).toEqual({ value: 10, error: null });
  });

  it("rejects empty, non-numeric, and < 1", () => {
    expect(validateMinContributions("").error).toBeTruthy();
    expect(validateMinContributions("abc").error).toBeTruthy();
    expect(validateMinContributions("2.5").error).toBeTruthy();
    expect(validateMinContributions("0").error).toBeTruthy();
    expect(validateMinContributions("-1").error).toBeTruthy();
  });
});

describe("parseChoice", () => {
  const options = [
    { label: "A", value: "a" },
    { label: "B", value: "b" },
    { label: "C", value: "c" },
  ] as const;

  it("resolves a 1-based numbered choice", () => {
    expect(parseChoice("1", options)).toBe("a");
    expect(parseChoice(" 3 ", options)).toBe("c");
  });

  it("returns null for blank, non-numeric, or out-of-range", () => {
    expect(parseChoice("", options)).toBeNull();
    expect(parseChoice("x", options)).toBeNull();
    expect(parseChoice("0", options)).toBeNull();
    expect(parseChoice("4", options)).toBeNull();
  });
});

describe("buildManualRawItem", () => {
  const entry: ManualEntry = {
    company: "Acme",
    role: "SRE",
    description: "Kubernetes reliability work",
    comp: "$100k",
    location: "Remote",
    remote: "remote",
    url: "https://acme.io/jobs/1",
    category: "Job",
    source_type: "job_board",
  };

  it("always routes to the manual adapter and threads category into the payload", () => {
    const raw = buildManualRawItem(entry, "2026-07-08T00:00:00.000Z");
    expect(raw.source_name).toBe("manual");
    expect(raw.source_type).toBe("job_board");
    expect(raw.url).toBe("https://acme.io/jobs/1");
    expect(raw.fetched_at).toBe("2026-07-08T00:00:00.000Z");
    expect(raw.raw_payload).toMatchObject({
      company: "Acme",
      role: "SRE",
      description: "Kubernetes reliability work",
      comp: "$100k",
      location: "Remote",
      remote: "remote",
      category: "Job",
    });
  });

  it("preserves null optionals", () => {
    const raw = buildManualRawItem(
      { ...entry, comp: null, location: null, remote: null, url: null },
      "2026-07-08T00:00:00.000Z"
    );
    expect(raw.url).toBeNull();
    const payload = raw.raw_payload as Record<string, unknown>;
    expect(payload.comp).toBeNull();
    expect(payload.location).toBeNull();
    expect(payload.remote).toBeNull();
  });
});
