// tests/args.test.ts
// Unit tests for the pure argv helpers in cli/args.ts.

import { describe, it, expect } from "vitest";
import { getFlag, hasFlag } from "../args";

describe("getFlag", () => {
  it("reads `--name value`", () => {
    expect(getFlag(["--company", "Acme Inc"], "--company")).toBe("Acme Inc");
  });

  it("reads `--name=value`", () => {
    expect(getFlag(["--repo=owner/repo"], "--repo")).toBe("owner/repo");
  });

  it("returns null when absent or value-less", () => {
    expect(getFlag(["--company"], "--company")).toBeNull();
    expect(getFlag(["--company", "--other"], "--company")).toBeNull();
    expect(getFlag([], "--company")).toBeNull();
  });
});

describe("hasFlag", () => {
  it("detects presence", () => {
    expect(hasFlag(["--dry-run"], "--dry-run")).toBe(true);
    expect(hasFlag([], "--dry-run")).toBe(false);
  });
});
