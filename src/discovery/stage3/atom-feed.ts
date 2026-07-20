// atom-feed.ts
// File: src/discovery/stage3/atom-feed.ts
// Purpose: The atom_feed family — a minimal hand-rolled Atom XML parser
//          (no XML-capable dependency exists in package.json; adding one was
//          rejected for this session) and sink routing. pipeline routes
//          through an adapter hook into RawItems (NLnet, Wave 4); calendar
//          returns typed CalendarEntry[] for Wave 4's calendar writer.
//          Single-config family: any failure is total failure, so
//          healthCheck uses the strict ok = (errors.length === 0) rule.

import type { RawItem } from "../../engines/normalization/types";
import type {
  CalendarEntry,
  FeedEntry,
  FeedPipelineAdapter,
  FeedSourceConfig,
  FetchResult,
  HealthCheckResult,
  SourceDeps,
  SourceError,
  Stage3Source,
} from "./types";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  const cdataStripped = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(cdataStripped).trim();
}

function extractLink(block: string): string | null {
  const m = block.match(/<link\b[^>]*\bhref=["']([^"']*)["'][^>]*\/?\s*>/i);
  return m ? m[1] : null;
}

/**
 * Entry-level failures (missing required id/title) are recorded in errors
 * and the entry is skipped — never a throw. A missing <feed> root is a
 * whole-document parse error.
 */
export function parseAtomFeed(xml: string, scope = "feed"): { entries: FeedEntry[]; errors: SourceError[] } {
  if (!/<feed[\s>]/i.test(xml)) {
    return { entries: [], errors: [{ scope, kind: "parse", detail: "no <feed> root element found" }] };
  }

  const errors: SourceError[] = [];
  const entries: FeedEntry[] = [];
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

  entryBlocks.forEach((block, index) => {
    const id = extractText(block, "id");
    const title = extractText(block, "title");
    if (!id || !title) {
      errors.push({ scope: `${scope}[${index}]`, kind: "shape", detail: "entry missing required id or title" });
      return;
    }
    entries.push({
      id,
      title,
      updated: extractText(block, "updated"),
      link: extractLink(block),
      content: extractText(block, "content") ?? extractText(block, "summary"),
    });
  });

  return { entries, errors };
}

export function mapFeedEntriesToCalendar(entries: FeedEntry[]): CalendarEntry[] {
  return entries.map((e) => ({
    title: e.title,
    date: e.updated,
    url: e.link,
    description: e.content,
  }));
}

async function fetchFeed(
  config: FeedSourceConfig,
  deps: SourceDeps,
  pipelineAdapter?: FeedPipelineAdapter
): Promise<FetchResult> {
  const scope = config.url;

  let response;
  try {
    response = await deps.httpGet(config.url);
  } catch (err) {
    return { items: [], errors: [{ scope, kind: "http", detail: err instanceof Error ? err.message : String(err) }] };
  }

  if (response.status !== 200) {
    return { items: [], errors: [{ scope, kind: "http", detail: `unexpected status ${response.status}` }] };
  }

  const { entries, errors } = parseAtomFeed(response.body, scope);

  if (config.sink === "calendar") {
    return { items: [], errors, calendarEntries: mapFeedEntriesToCalendar(entries) };
  }

  if (!pipelineAdapter) {
    return {
      items: [],
      errors: [...errors, { scope, kind: "shape", detail: "pipeline sink requires a FeedPipelineAdapter" }],
    };
  }

  const items: RawItem[] = entries.map((e) => pipelineAdapter.toRawItem(e, config));
  return { items, errors };
}

export function createAtomFeedSource(config: FeedSourceConfig, pipelineAdapter?: FeedPipelineAdapter): Stage3Source {
  return {
    name: `atom:${config.url}`,
    family: "atom_feed",
    enabled: config.enabled,
    fetch: (deps) => fetchFeed(config, deps, pipelineAdapter),
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const result = await fetchFeed(config, deps, pipelineAdapter);
      const ok = result.errors.length === 0;
      const count = config.sink === "calendar" ? result.calendarEntries?.length ?? 0 : result.items.length;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok ? `ok, ${count} entries` : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
