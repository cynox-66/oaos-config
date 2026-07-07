// tests/intake-mapping.test.ts
// F1 (source_type menu) + F2 (category menu, precedence over inference) as pure
// functions. No API calls: the F2 assertion exercises the manual adapter through
// normalize, which is pure.

import { describe, it, expect } from "vitest";
import { normalize } from "../../src/engines/normalization";
import { buildManualRawItem } from "../prompts";
import {
  parseSourceType,
  parseCategory,
  SOURCE_TYPE_OPTIONS,
  CATEGORY_OPTIONS,
} from "../commands/intake";

describe("parseSourceType (F1)", () => {
  it("maps each menu position to the specified SourceType", () => {
    expect(parseSourceType("1")).toBe("oss"); // GitHub / OSS
    expect(parseSourceType("2")).toBe("job_board"); // Job board / LinkedIn
    expect(parseSourceType("3")).toBe("freelance"); // Freelance platform
    expect(parseSourceType("4")).toBe("network"); // Startup / network
    expect(parseSourceType("5")).toBe("network"); // Other / skip
  });

  it("defaults unrecognized input to network", () => {
    expect(parseSourceType("")).toBe("network");
    expect(parseSourceType("9")).toBe("network");
    expect(parseSourceType("x")).toBe("network");
  });

  it("presents exactly five options", () => {
    expect(SOURCE_TYPE_OPTIONS).toHaveLength(5);
  });
});

describe("parseCategory (F2)", () => {
  it("maps each menu position to the specified Category", () => {
    expect(parseCategory("1")).toBe("Job");
    expect(parseCategory("2")).toBe("Internship");
    expect(parseCategory("3")).toBe("Freelance");
    expect(parseCategory("4")).toBe("Startup");
    expect(parseCategory("5")).toBe("OSS");
    expect(parseCategory("6")).toBe("Other");
  });

  it("defaults unrecognized input to Other", () => {
    expect(parseCategory("")).toBe("Other");
    expect(parseCategory("9")).toBe("Other");
  });

  it("presents exactly six options", () => {
    expect(CATEGORY_OPTIONS).toHaveLength(6);
  });
});

describe("F2 — chosen category takes precedence over inference", () => {
  it("keeps the operator's category even when the text would infer another", () => {
    // Description says "internship", which inferCategory would map to Internship;
    // the operator explicitly chose Startup, which must win.
    const raw = buildManualRawItem(
      {
        company: "Acme",
        role: "Founding Engineer",
        description: "Great internship-style learning environment",
        comp: null,
        location: null,
        remote: null,
        url: null,
        category: "Startup",
        source_type: "network",
      },
      "2026-07-08T00:00:00.000Z"
    );
    expect(normalize(raw).category).toBe("Startup");
  });

  it("still infers when no category is asserted (free-text path)", () => {
    const raw = buildManualRawItem(
      {
        company: "Acme",
        role: "Backend Intern",
        description: "Summer internship program",
        comp: null,
        location: null,
        remote: null,
        url: null,
        category: "", // not a valid Category → adapter yields null → engine infers
        source_type: "job_board",
      },
      "2026-07-08T00:00:00.000Z"
    );
    expect(normalize(raw).category).toBe("Internship");
  });
});
