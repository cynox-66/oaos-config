// nlnet.test.ts
// File: src/discovery/stage3/tests/nlnet.test.ts
//
// Feed fixture below is trimmed from the real live fetch of
// https://nlnet.nl/feed.atom (2026-07-21) — 3 real entries kept verbatim
// (id/title/updated/link) to demonstrate the genuine content mix: a grant
// award announcement interleaved with general blog/analysis posts.

import { describe, expect, it } from "vitest";
import { createNlnetSource, nlnetAdapter, NLNET_CONFIG } from "../sources/nlnet";
import type { SourceDeps } from "../types";

const now = () => "2026-07-21T00:00:00.000Z";

const nlnetFeedFixture = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>https://nlnet.nl/news/2026/20260713-changing-chip-industry.html</id>
    <title>Changing the Chip Industry</title>
    <updated>2026-07-13T00:00:00Z</updated>
    <link href="/news/2026/20260713-changing-chip-industry.html" rel="alternate"/>
  </entry>
  <entry>
    <id>https://nlnet.nl/news/2026/20260616-67-new-projects.html</id>
    <title>67 Open Technology Projects awarded NGI grants</title>
    <updated>2026-06-16T00:00:00Z</updated>
    <link href="/news/2026/20260616-67-new-projects.html" rel="alternate"/>
  </entry>
  <entry>
    <id>https://nlnet.nl/news/2026/20260615-Book-free-internet.html</id>
    <title>Book: Building a Free Internet of the Future</title>
    <updated>2026-06-15T00:00:00Z</updated>
    <link href="/news/2026/20260615-Book-free-internet.html" rel="alternate"/>
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

describe("nlnetAdapter.toRawItem", () => {
  it("every entry becomes a RawItem regardless of type — no classification/filtering", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: nlnetFeedFixture }) });
    const source = createNlnetSource();
    const result = await source.fetch(deps);
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(3);
    for (const item of result.items) {
      expect(item.source_type).toBe("oss");
      expect(item.source_name).toBe("nlnet");
      expect(item.fetched_at).toBe(now());
    }
    // grant-announcement entry present alongside general blog entries, unfiltered
    const titles = result.items.map((i) => (i.raw_payload as { title: string }).title);
    expect(titles).toContain("67 Open Technology Projects awarded NGI grants");
    expect(titles).toContain("Changing the Chip Industry");
  });

  it("uses the feed entry's link as the RawItem url", () => {
    const item = nlnetAdapter.toRawItem(
      { id: "urn:1", title: "t", updated: null, link: "https://nlnet.nl/x", content: null },
      NLNET_CONFIG,
      depsWith({})
    );
    expect(item.url).toBe("https://nlnet.nl/x");
  });
});
