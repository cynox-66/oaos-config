// outreachy.ts
// File: src/discovery/stage3/sources/outreachy.ts
// Purpose: Outreachy blog Atom feed — calendar sink ONLY. Confirmed live
//          2026-07-21: https://www.outreachy.org/blog/feed/ parses cleanly
//          (43 entries, 0 errors); cohort-timing is present directly in
//          titles ("Call for May 2026 mentoring communities", "May 2026
//          initial applications open"); `content` is null on every sampled
//          entry (the feed carries no body, title/link/updated only).
//
// D18 boundary: NOTHING from this source enters the opportunity pipeline —
// per-project detail stays manual by design. If a future change routes
// Outreachy entries toward the pipeline sink, that is the D18 boundary
// being crossed; stop.

import type { FeedSourceConfig } from "../types";
import { createAtomFeedSource } from "../atom-feed";

export const OUTREACHY_CONFIG: FeedSourceConfig = {
  url: "https://www.outreachy.org/blog/feed/",
  sink: "calendar",
  enabled: true,
};

export function createOutreachySource(config: FeedSourceConfig = OUTREACHY_CONFIG) {
  return createAtomFeedSource(config);
}
