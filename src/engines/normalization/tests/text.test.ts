// text.test.ts
// File: src/engines/normalization/tests/text.test.ts
// Purpose: stripHtml's entity-decode-before-tag-strip ordering (fix for the
// Greenhouse entity-escaped-content defect found during the 2026-07-31 Wave 8
// live verification — see docs/known-issues.md #21).

import { describe, expect, it } from "vitest";
import { stripHtml, cleanDescription } from "../text";

describe("stripHtml — entity-escaped input", () => {
  it("strips entity-escaped tags and leaves clean text (the Greenhouse shape)", () => {
    const input =
      '&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;Grafana Labs, the company&lt;/p&gt;&lt;/div&gt;';
    expect(stripHtml(input)).not.toMatch(/<[^>]+>/);
    expect(cleanDescription(input)).toBe("Grafana Labs, the company");
  });
});

describe("stripHtml — literal HTML input (pre-existing target shape)", () => {
  it("produces byte-identical output to the pre-reorder behavior", () => {
    // No entities anywhere in this input, so decode-first is a no-op and the
    // subsequent script/style/tag stripping runs exactly as before.
    const input = "<p>Build <b>kubernetes</b> tooling.</p> No entities here.";
    expect(stripHtml(input)).toBe(" Build  kubernetes  tooling.  No entities here.");
  });

  it("literal HTML with a text-level entity (e.g. &amp;) is unaffected by order", () => {
    const input = "<p>Security &amp; Compliance Engineer</p>";
    // Whichever order runs, the tag is stripped and the entity decoded;
    // there is no tag/entity interaction here to reorder around.
    expect(stripHtml(input)).toBe(" Security & Compliance Engineer ");
  });
});

describe("stripHtml — escaped script/style content (documented behavior change)", () => {
  it("text merely describing an escaped <script> block has that block's content removed, not leaked as literal markup", () => {
    const input =
      "Please avoid using &lt;script&gt;alert(1)&lt;/script&gt; in your submission.";
    const out = stripHtml(input);
    // Old (pre-reorder) behavior would have left the literal tags AND content
    // ("Please avoid using <script>alert(1)</script> in your submission.")
    // unremoved, since decode ran last with nothing downstream to strip them.
    // New behavior: decode materializes the tags, then the script-block regex
    // removes the whole block — including "alert(1)" — same as it already
    // does for a genuine literal <script> tag.
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("Please avoid using");
    expect(out).toContain("in your submission.");
  });
});
