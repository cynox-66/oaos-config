// ghsl.ts
// File: src/discovery/stage3/sources/ghsl.ts
// Purpose: GitHub Security Lab Atom feed — pipeline sink. Confirmed live
//          2026-07-21: https://securitylab.github.com/feed.xml is a valid,
//          well-formed Atom document (correct namespace, generator, title,
//          subtitle) that parses cleanly with the existing parseAtomFeed —
//          but it currently has ZERO <entry> elements. This is a verified
//          mechanism with dormant content, not a broken source (contrast
//          GSoC, which was rejected because the target repo doesn't exist
//          at all — see stage3/README.md's documented-rejects section).
//          Operator ruling: build now. It sits idle at zero cost until
//          GitHub Security Lab publishes to this feed, then starts flowing
//          automatically — a good fit given the security-research/evidence
//          overlap with this operator's OSS security background. Same
//          content-agnostic, no-classification adapter pattern as NLnet.

import type { FeedEntry, FeedPipelineAdapter, FeedSourceConfig } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { createAtomFeedSource } from "../atom-feed";

export const GHSL_CONFIG: FeedSourceConfig = {
  url: "https://securitylab.github.com/feed.xml",
  sink: "pipeline",
  enabled: true,
};

export const ghslAdapter: FeedPipelineAdapter = {
  toRawItem(entry: FeedEntry, _config: FeedSourceConfig, deps): RawItem {
    return {
      source_type: "oss",
      source_name: "ghsl",
      raw_payload: entry,
      url: entry.link,
      fetched_at: deps.now(),
    };
  },
};

export function createGhslSource(config: FeedSourceConfig = GHSL_CONFIG) {
  return createAtomFeedSource(config, ghslAdapter);
}
