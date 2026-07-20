// text.test.ts
// File: src/discovery/prerank/tests/text.test.ts
// Purpose: Unit tests for the Prerank Gate's pure text helpers.

import { describe, expect, it } from "vitest";
import { cleanText, extractText, matchedTerms, termPresent, tokenize } from "../text";
import type { RawItem } from "../../../engines/normalization/types";

function item(payload: object | string): RawItem {
  return {
    source_type: "job_board",
    source_name: "fixture",
    raw_payload: payload,
    url: null,
    fetched_at: "2026-07-01T00:00:00.000Z",
  };
}

describe("cleanText", () => {
  it("strips HTML tags, decodes entities, lowercases, collapses whitespace", () => {
    const raw = "<div><h1>Platform  Engineer</h1><p>R&amp;D&nbsp;team\n\nrole</p></div>";
    expect(cleanText(raw)).toBe("platform engineer r&d team role");
  });

  it("decodes the remaining minimal entity set", () => {
    expect(cleanText("a &lt;b&gt; &quot;c&quot; &#39;d&#39;")).toBe("a <b> \"c\" 'd'");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(cleanText("   \n\t  ")).toBe("");
  });
});

describe("extractText", () => {
  it("uses a string raw_payload directly", () => {
    expect(extractText(item("Senior <b>SRE</b>"))).toBe("senior sre");
  });

  it("harvests string fields from a flat object", () => {
    const text = extractText(item({ title: "SRE", description: "Kubernetes work" }));
    expect(text).toContain("sre");
    expect(text).toContain("kubernetes");
  });

  it("walks nested objects and arrays", () => {
    const text = extractText(
      item({
        job: { title: "Platform Engineer", tags: ["eBPF", "Cilium"] },
        meta: { company: { name: "Acme" } },
      }),
    );
    expect(text).toContain("platform engineer");
    expect(text).toContain("ebpf");
    expect(text).toContain("cilium");
    expect(text).toContain("acme");
  });

  it("ignores non-string leaves without crashing", () => {
    const text = extractText(
      item({ title: "SRE", salary: 120000, remote: true, team: null, extra: undefined }),
    );
    expect(text).toBe("sre");
  });

  it("returns an empty string for an empty object payload", () => {
    expect(extractText(item({}))).toBe("");
  });
});

describe("tokenize", () => {
  it("splits on non-alphanumerics but keeps in-word symbols", () => {
    expect(tokenize("ci/cd and node.js, c++ dev")).toEqual(["ci/cd", "and", "node.js", "c++", "dev"]);
  });

  it("returns an empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("termPresent", () => {
  it("respects word boundaries for single tokens", () => {
    expect(termPresent("she was stressed", "sre")).toBe(false);
    expect(termPresent("hiring an sre now", "sre")).toBe(true);
  });

  it("matches at string start and end", () => {
    expect(termPresent("ebpf", "ebpf")).toBe(true);
  });

  it("matches multi-word phrases with boundaries", () => {
    expect(termPresent("a site reliability engineer", "site reliability")).toBe(true);
    expect(termPresent("offsite reliability", "site reliability")).toBe(false);
  });

  it("is false for empty terms", () => {
    expect(termPresent("anything", "  ")).toBe(false);
  });
});

describe("matchedTerms", () => {
  it("returns matches in vocabulary order without duplicates", () => {
    const text = "kubernetes engineer, kubernetes platform";
    expect(matchedTerms(text, ["kubernetes", "Kubernetes", "engineer", "rust"])).toEqual([
      "kubernetes",
      "engineer",
    ]);
  });
});
