// atom-feed.test.ts
// File: src/discovery/stage3/tests/atom-feed.test.ts

import { describe, expect, it } from "vitest";
import { createAtomFeedSource, mapFeedEntriesToCalendar, parseAtomFeed } from "../atom-feed";
import type { FeedPipelineAdapter, FeedSourceConfig, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";

const now = () => "2026-07-20T00:00:00.000Z";

const validFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>NLnet grants</title>
  <entry>
    <id>urn:nlnet:1</id>
    <title>Fund a project</title>
    <updated>2026-07-01T00:00:00Z</updated>
    <link href="https://nlnet.nl/project/1" rel="alternate"/>
    <content type="html">Details &amp; more</content>
  </entry>
  <entry>
    <id>urn:nlnet:2</id>
    <title>Second grant</title>
    <summary>Summary text</summary>
  </entry>
</feed>`;

const emptyFeed = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;

const malformedFeed = `<not-a-feed>this is not atom at all</not-a-feed>`;

const entryMissingId = `<feed><entry><title>No id here</title></entry></feed>`;

describe("parseAtomFeed", () => {
  it("valid feed -> correct entries, entities decoded, missing optional fields null", () => {
    const { entries, errors } = parseAtomFeed(validFeed);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "urn:nlnet:1",
      title: "Fund a project",
      updated: "2026-07-01T00:00:00Z",
      link: "https://nlnet.nl/project/1",
      content: "Details & more",
    });
  });

  it("entry missing optional fields survives with nulls", () => {
    const { entries } = parseAtomFeed(validFeed);
    expect(entries[1]).toEqual({
      id: "urn:nlnet:2",
      title: "Second grant",
      updated: null,
      link: null,
      content: "Summary text",
    });
  });

  it("malformed XML (no <feed> root) -> parse error in errors, not a throw", () => {
    const { entries, errors } = parseAtomFeed(malformedFeed, "nlnet");
    expect(entries).toEqual([]);
    expect(errors).toEqual([{ scope: "nlnet", kind: "parse", detail: "no <feed> root element found" }]);
  });

  it("empty feed (valid root, no entries) -> empty, ok", () => {
    const { entries, errors } = parseAtomFeed(emptyFeed);
    expect(entries).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("an entry missing required id/title is skipped with a per-entry shape error, feed still parses", () => {
    const { entries, errors } = parseAtomFeed(entryMissingId, "nlnet");
    expect(entries).toEqual([]);
    expect(errors).toEqual([{ scope: "nlnet[0]", kind: "shape", detail: "entry missing required id or title" }]);
  });
});

describe("mapFeedEntriesToCalendar", () => {
  it("maps FeedEntry fields to CalendarEntry fields", () => {
    const { entries } = parseAtomFeed(validFeed);
    expect(mapFeedEntriesToCalendar(entries)).toEqual([
      { title: "Fund a project", date: "2026-07-01T00:00:00Z", url: "https://nlnet.nl/project/1", description: "Details & more" },
      { title: "Second grant", date: null, url: null, description: "Summary text" },
    ]);
  });
});

describe("createAtomFeedSource — sink routing", () => {
  const pipelineConfig: FeedSourceConfig = { url: "https://nlnet.nl/feed.atom", sink: "pipeline", enabled: true };
  const calendarConfig: FeedSourceConfig = { url: "https://outreachy.org/feed.atom", sink: "calendar", enabled: true };

  const deps: SourceDeps = {
    httpGet: async () => ({ status: 200, body: validFeed }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
  };

  it("pipeline sink -> RawItem[] via adapter hook, source_type oss, calendarEntries undefined", async () => {
    const adapter: FeedPipelineAdapter = {
      toRawItem: (entry, cfg): RawItem => ({
        source_type: "oss",
        source_name: `atom:${cfg.url}`,
        raw_payload: { title: entry.title },
        url: entry.link,
        fetched_at: now(),
      }),
    };
    const source = createAtomFeedSource(pipelineConfig, adapter);
    expect(source.family).toBe("atom_feed");
    const result = await source.fetch(deps);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].source_type).toBe("oss");
    expect(result.calendarEntries).toBeUndefined();
  });

  it("pipeline sink without an adapter -> shape error, no throw", async () => {
    const result = await createAtomFeedSource(pipelineConfig).fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.errors.some((e) => e.kind === "shape")).toBe(true);
  });

  it("calendar sink -> items empty, calendarEntries populated, nothing written", async () => {
    const result = await createAtomFeedSource(calendarConfig).fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.calendarEntries).toHaveLength(2);
    expect(result.calendarEntries?.[0].title).toBe("Fund a project");
  });

  it("healthCheck strict single-config rule: parse error -> ok:false", async () => {
    const brokenDeps: SourceDeps = {
      httpGet: async () => ({ status: 200, body: malformedFeed }),
      httpPost: async () => ({ status: 200, body: "" }),
      now,
    };
    const result = await createAtomFeedSource(calendarConfig).healthCheck(brokenDeps);
    expect(result.ok).toBe(false);
  });

  it("healthCheck ok:true reports entry count for calendar sink", async () => {
    const result = await createAtomFeedSource(calendarConfig).healthCheck(deps);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("2 entries");
  });
});
