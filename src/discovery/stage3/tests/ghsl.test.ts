// ghsl.test.ts
// File: src/discovery/stage3/tests/ghsl.test.ts
//
// realEmptyFeedFixture is the EXACT real body fetched live from
// https://securitylab.github.com/feed.xml (2026-07-21) — valid, well-formed
// Atom (correct namespace/generator/title/subtitle), zero <entry> elements.
// This is the verified-mechanism/dormant-content state the operator ruled
// to build against: 0 items + 0 errors is a valid, healthy result, not a
// failure. populatedFeedFixture is synthetic (the real feed has no entries
// yet) and exists only to exercise the content-agnostic mapping path.

import { describe, expect, it } from "vitest";
import { createGhslSource, ghslAdapter, GHSL_CONFIG } from "../sources/ghsl";
import type { SourceDeps } from "../types";

const now = () => "2026-07-21T00:00:00.000Z";

const realEmptyFeedFixture =
  '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom" >' +
  '<generator uri="https://jekyllrb.com/" version="4.3.4">Jekyll</generator>' +
  '<link href="https://securitylab.github.com/feed.xml" rel="self" type="application/atom+xml" />' +
  '<link href="https://securitylab.github.com/" rel="alternate" type="text/html" />' +
  "<updated>2026-07-13T16:26:03+00:00</updated>" +
  "<id>https://securitylab.github.com/feed.xml</id>" +
  '<title type="html">GitHub Security Lab</title>' +
  "<subtitle>Securing open source software, together.</subtitle></feed>";

const populatedFeedFixture = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>https://securitylab.github.com/research/example-advisory</id>
    <title>Example Security Advisory</title>
    <updated>2026-07-20T00:00:00Z</updated>
    <link href="https://securitylab.github.com/research/example-advisory" rel="alternate"/>
  </entry>
</feed>`;

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("createGhslSource", () => {
  it("verified-mechanism, dormant-content: real empty feed -> 0 items, 0 errors, healthy", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: realEmptyFeedFixture }) });
    const source = createGhslSource();
    const result = await source.fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("healthCheck ok:true even with zero entries — empty is a valid state, not a failure", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: realEmptyFeedFixture }) });
    const result = await createGhslSource().healthCheck(deps);
    expect(result.ok).toBe(true);
  });

  it("once populated, entries map to RawItems content-agnostically, same as NLnet", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: populatedFeedFixture }) });
    const result = await createGhslSource().fetch(deps);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source_type).toBe("oss");
    expect(result.items[0].source_name).toBe("ghsl");
    expect(result.items[0].fetched_at).toBe(now());
  });

  it("ghslAdapter.toRawItem uses the entry's link as url", () => {
    const item = ghslAdapter.toRawItem(
      { id: "urn:1", title: "t", updated: null, link: "https://securitylab.github.com/x", content: null },
      GHSL_CONFIG,
      depsWith({})
    );
    expect(item.url).toBe("https://securitylab.github.com/x");
  });
});
