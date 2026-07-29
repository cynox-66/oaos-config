// truncation.test.ts
// File: src/discovery/stage3/tests/truncation.test.ts
//
// The content-quarantine mechanism, tested against Engine 1 and the prerank
// gate directly — not against a restatement of what they do. The whole point
// of the quarantine is a claim about those two modules' real behaviour, so the
// assertions call them.

import { describe, expect, it } from "vitest";
import { normalize } from "../../../engines/normalization";
import { extractText } from "../../prerank/text";
import { ADAPTER_CONTENT_KEYS, QuarantineError, quarantineContent } from "../query/truncation";

const TRUNCATED = "We are hiring a Kubernetes platform engineer to run our clusters and …";

function quarantinedItem() {
  return {
    source_type: "job_board" as const,
    source_name: "adzuna",
    raw_payload: quarantineContent(
      { title: "Platform Engineer", company: "Acme", location: "India" },
      TRUNCATED,
      "adzuna:search-api-500char",
      { title: "Platform Engineer", description: TRUNCATED, redirect_url: "https://x.test/1" }
    ),
    url: "https://x.test/1",
    fetched_at: "2026-07-28T12:00:00.000Z",
  };
}

describe("quarantineContent", () => {
  it("marks the payload and preserves the original record untouched", () => {
    const payload = quarantineContent({ title: "T" }, TRUNCATED, "freehire:search-api-1k-cap", { a: 1, b: "two" });
    expect(payload.content_truncated).toBe(true);
    expect(payload.content_source).toBe("freehire:search-api-1k-cap");
    expect(payload.description_truncated).toBe(TRUNCATED);
    expect(payload.source_record).toEqual({ a: 1, b: "two" });
  });

  it("keeps lifted fields at the top level so Engine 1 can fingerprint", () => {
    const payload = quarantineContent({ title: "T", company: "C" }, TRUNCATED, "adzuna:search-api-500char", {});
    expect(payload.title).toBe("T");
    expect(payload.company).toBe("C");
  });

  it("THROWS if a lifted field would be read as a description", () => {
    for (const key of ADAPTER_CONTENT_KEYS) {
      expect(() => quarantineContent({ [key]: "oops" }, TRUNCATED, "adzuna:search-api-500char", {})).toThrow(
        QuarantineError
      );
    }
  });
});

describe("the quarantine's actual downstream effect", () => {
  it("Engine 1 produces NO description from a quarantined payload", () => {
    const opportunity = normalize(quarantinedItem());
    expect(opportunity.description_raw).toBe("");
    expect(opportunity.description_norm).toBe("");
  });

  it("Engine 1 still gets company and role, so fingerprints stay distinct", () => {
    const opportunity = normalize(quarantinedItem());
    expect(opportunity.company).toBe("Acme");
    expect(opportunity.role).toBe("Platform Engineer");

    const other = quarantinedItem();
    other.raw_payload = quarantineContent(
      { title: "SRE", company: "Beta", location: "India" },
      TRUNCATED,
      "adzuna:search-api-500char",
      {}
    );
    other.url = "https://y.test/2";
    expect(normalize(other).fingerprint).not.toBe(opportunity.fingerprint);
  });

  it("prerank still SEES the truncated text, so relevance is unaffected", () => {
    const text = extractText(quarantinedItem());
    expect(text).toContain("kubernetes");
    expect(text).toContain("platform engineer");
  });

  it("a naive payload would have leaked the text as content — the control case", () => {
    const leaky = {
      ...quarantinedItem(),
      raw_payload: { title: "Platform Engineer", company: "Acme", description: TRUNCATED },
    };
    expect(normalize(leaky).description_raw).not.toBe("");
  });
});
