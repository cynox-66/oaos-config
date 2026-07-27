// esoc.test.ts
// File: src/discovery/stage3/tests/esoc.test.ts

import { describe, expect, it } from "vitest";
import { createEsocSource, esocAdapter, ESOC_CONFIG } from "../sources/esoc";
import type { SourceDeps } from "../types";
import cardsListing from "./fixtures/esoc/cards-listing.json";
import cardsListingEmpty from "./fixtures/esoc/cards-listing-empty.json";

const now = () => "2026-07-21T00:00:00.000Z";

function depsWith(overrides: Partial<SourceDeps>): SourceDeps {
  return {
    httpGet: async () => ({ status: 200, body: "" }),
    httpPost: async () => ({ status: 200, body: "" }),
    now,
    ...overrides,
  };
}

describe("esocAdapter.interpretEntries", () => {
  it("excludes the batches file, maps each project card to a RawItem", () => {
    const items = esocAdapter.interpretEntries(cardsListing, ESOC_CONFIG, depsWith({}));
    expect(items).toHaveLength(4);
    expect(items.map((i) => (i.raw_payload as { name: string }).name)).not.toContain("gcos-esoc2026-batches.md");
    expect(items[0].source_type).toBe("oss");
    expect(items[0].source_name).toBe("esoc");
    expect(items[0].fetched_at).toBe(now());
  });

  it("uses download_url when present", () => {
    const items = esocAdapter.interpretEntries(cardsListing, ESOC_CONFIG, depsWith({}));
    const pyaptamer = items.find((i) => (i.raw_payload as { name: string }).name === "pyaptamer.md");
    expect(pyaptamer?.url).toBe(
      "https://raw.githubusercontent.com/european-summer-of-code/esoc2026/main/cards/pyaptamer.md"
    );
  });

  it("falls back to a constructed github blob URL when download_url is null", () => {
    const entryNoDownload = { ...cardsListing[1], download_url: null };
    const items = esocAdapter.interpretEntries([entryNoDownload], ESOC_CONFIG, depsWith({}));
    expect(items[0].url).toBe(
      "https://github.com/european-summer-of-code/esoc2026/blob/main/cards/predictive_sensor.md"
    );
  });

  it("empty directory -> empty, no error", () => {
    const items = esocAdapter.interpretEntries(cardsListingEmpty, ESOC_CONFIG, depsWith({}));
    expect(items).toEqual([]);
  });
});

describe("createEsocSource", () => {
  it("wires the adapter through createGitHubRepoSource", async () => {
    const deps = depsWith({
      httpGet: async (url) => {
        expect(url).toBe("https://api.github.com/repos/european-summer-of-code/esoc2026/contents/cards");
        return { status: 200, body: JSON.stringify(cardsListing) };
      },
    });
    const source = createEsocSource();
    expect(source.family).toBe("github_repo");
    const result = await source.fetch(deps);
    expect(result.items).toHaveLength(4);
    expect(result.errors).toEqual([]);
  });
});
