// nlnet.ts
// File: src/discovery/stage3/sources/nlnet.ts
// Purpose: NLnet Atom feed — pipeline sink. Confirmed live 2026-07-21:
//          https://nlnet.nl/feed.atom parses cleanly with the existing
//          parseAtomFeed (342 entries, 0 errors). Content is a genuine mix
//          of grant-award announcements and general blog/analysis posts —
//          this adapter does NOT classify or filter; every entry becomes a
//          RawItem regardless of type, and prerank + the pipeline sort
//          relevance downstream. No hardcoded assumption about NGI call
//          cadence.

import type { FeedEntry, FeedPipelineAdapter, FeedSourceConfig } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { createAtomFeedSource } from "../atom-feed";

export const NLNET_CONFIG: FeedSourceConfig = {
  url: "https://nlnet.nl/feed.atom",
  sink: "pipeline",
  enabled: true,
};

export const nlnetAdapter: FeedPipelineAdapter = {
  toRawItem(entry: FeedEntry, _config: FeedSourceConfig, deps): RawItem {
    return {
      source_type: "oss",
      source_name: "nlnet",
      raw_payload: entry,
      url: entry.link,
      fetched_at: deps.now(),
    };
  },
};

export function createNlnetSource(config: FeedSourceConfig = NLNET_CONFIG) {
  return createAtomFeedSource(config, nlnetAdapter);
}
