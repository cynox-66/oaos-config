// outreachy.test.ts
// File: src/discovery/stage3/tests/outreachy.test.ts
//
// Feed fixture below is trimmed from the real live fetch of
// https://www.outreachy.org/blog/feed/ (2026-07-21) — 3 real entries kept
// verbatim (id/title/updated/link); content is null on every real sampled
// entry (the feed carries no body), reproduced here as-is.

import { describe, expect, it } from "vitest";
import { createOutreachySource } from "../sources/outreachy";
import type { SourceDeps } from "../types";

const now = () => "2026-07-21T00:00:00.000Z";

const outreachyFeedFixture = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>https://www.outreachy.org/blog/2026-02-06/may-2026-call-for-mentoring-organizations/</id>
    <title>Call for May 2026 mentoring communities</title>
    <updated>2026-02-06T16:00:00-08:00</updated>
    <link href="https://www.outreachy.org/blog/2026-02-06/may-2026-call-for-mentoring-organizations/" rel="alternate"/>
  </entry>
  <entry>
    <id>https://www.outreachy.org/blog/2026-02-06/may-2026-initial-applications-open/</id>
    <title>Outreachy May 2026 internship applications open</title>
    <updated>2026-02-06T16:00:00-08:00</updated>
    <link href="https://www.outreachy.org/blog/2026-02-06/may-2026-initial-applications-open/" rel="alternate"/>
  </entry>
  <entry>
    <id>https://www.outreachy.org/blog/2025-08-25/december-2025-initial-applications-open/</id>
    <title>Outreachy December 2025 internship applications open</title>
    <updated>2025-08-25T16:00:00-07:00</updated>
    <link href="https://www.outreachy.org/blog/2025-08-25/december-2025-initial-applications-open/" rel="alternate"/>
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

describe("createOutreachySource — D18 boundary", () => {
  it("produces CalendarEntry[] from the feed, cohort-timing preserved in titles", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: outreachyFeedFixture }) });
    const result = await createOutreachySource().fetch(deps);
    expect(result.calendarEntries).toHaveLength(3);
    expect(result.calendarEntries?.[0].title).toBe("Call for May 2026 mentoring communities");
  });

  it("D18: items is ALWAYS empty — nothing from this source enters the opportunity pipeline", async () => {
    const deps = depsWith({ httpGet: async () => ({ status: 200, body: outreachyFeedFixture }) });
    const result = await createOutreachySource().fetch(deps);
    expect(result.items).toEqual([]);
  });
});
