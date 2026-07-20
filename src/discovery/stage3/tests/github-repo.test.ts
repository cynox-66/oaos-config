// github-repo.test.ts
// File: src/discovery/stage3/tests/github-repo.test.ts

import { describe, expect, it } from "vitest";
import { buildAuthHeader, buildContentsApiUrl, createGitHubRepoSource, parseContentsResponse } from "../github-repo";
import type { ContentsApiEntry, RepoAdapter, RepoSourceConfig, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";

const now = () => "2026-07-20T00:00:00.000Z";
const config: RepoSourceConfig = { owner: "cncf", repo: "lfx-mentorship", path: "projects", enabled: true };

const validListing = [
  { name: "proj-a.md", path: "projects/proj-a.md", type: "file", sha: "abc123", download_url: "https://example/proj-a.md" },
  { name: "proj-b.md", path: "projects/proj-b.md", type: "file", sha: "def456", download_url: null },
];

describe("buildContentsApiUrl / buildAuthHeader", () => {
  it("constructs the Contents API URL from owner/repo/path", () => {
    expect(buildContentsApiUrl(config)).toBe("https://api.github.com/repos/cncf/lfx-mentorship/contents/projects");
  });

  it("omits the auth header when no token is given", () => {
    expect(buildAuthHeader(undefined)).toBeUndefined();
  });

  it("includes an Authorization header when a token is given", () => {
    expect(buildAuthHeader("ghp_fixture")).toEqual({ Authorization: "token ghp_fixture" });
  });
});

describe("parseContentsResponse", () => {
  it("parses a valid directory listing", () => {
    const result = parseContentsResponse({ status: 200, body: JSON.stringify(validListing) }, "scope");
    expect(result).toEqual({ entries: validListing });
  });

  it("non-200 status -> SourceError kind 'http'", () => {
    const result = parseContentsResponse({ status: 404, body: "not found" }, "scope");
    expect(result).toEqual({ error: { scope: "scope", kind: "http", detail: "unexpected status 404" } });
  });

  it("invalid JSON body -> SourceError kind 'shape'", () => {
    const result = parseContentsResponse({ status: 200, body: "{not json" }, "scope");
    expect(result).toMatchObject({ error: { scope: "scope", kind: "shape" } });
  });

  it("JSON that is not an array -> SourceError kind 'shape'", () => {
    const result = parseContentsResponse({ status: 200, body: JSON.stringify({ message: "single object" }) }, "scope");
    expect(result).toEqual({ error: { scope: "scope", kind: "shape", detail: "expected an array of directory entries" } });
  });

  it("an entry missing required fields -> SourceError kind 'shape'", () => {
    const bad = [{ name: "x" }];
    const result = parseContentsResponse({ status: 200, body: JSON.stringify(bad) }, "scope");
    expect(result).toMatchObject({ error: { scope: "scope", kind: "shape" } });
  });
});

describe("createGitHubRepoSource", () => {
  const rawItem: RawItem = {
    source_type: "oss",
    source_name: "github:cncf/lfx-mentorship",
    raw_payload: { name: "proj-a.md" },
    url: "https://example/proj-a.md",
    fetched_at: now(),
  };

  it("valid listing -> adapter hook invoked, items returned, name/family set", async () => {
    let received: ContentsApiEntry[] | null = null;
    const adapter: RepoAdapter = {
      interpretEntries: (entries) => {
        received = entries;
        return [rawItem];
      },
    };
    const deps: SourceDeps = {
      httpGet: async () => ({ status: 200, body: JSON.stringify(validListing) }),
      httpPost: async () => ({ status: 200, body: "" }),
      now,
    };
    const source = createGitHubRepoSource(config, adapter);
    expect(source.name).toBe("github:cncf/lfx-mentorship");
    expect(source.family).toBe("github_repo");
    expect(source.enabled).toBe(true);

    const result = await source.fetch(deps);
    expect(result.items).toEqual([rawItem]);
    expect(result.errors).toEqual([]);
    expect(received).toEqual(validListing);
  });

  it("passes the auth header through from tokenProvider", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const deps: SourceDeps = {
      httpGet: async (_url, headers) => {
        seenHeaders = headers;
        return { status: 200, body: JSON.stringify([]) };
      },
      httpPost: async () => ({ status: 200, body: "" }),
      now,
    };
    const adapter: RepoAdapter = { interpretEntries: () => [] };
    await createGitHubRepoSource(config, adapter, () => "ghp_fixture").fetch(deps);
    expect(seenHeaders).toEqual({ Authorization: "token ghp_fixture" });
  });

  it("non-200 -> FetchResult.errors has kind 'http', items empty", async () => {
    const deps: SourceDeps = {
      httpGet: async () => ({ status: 500, body: "" }),
      httpPost: async () => ({ status: 200, body: "" }),
      now,
    };
    const adapter: RepoAdapter = { interpretEntries: () => [] };
    const result = await createGitHubRepoSource(config, adapter).fetch(deps);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      { scope: "cncf/lfx-mentorship:projects", kind: "http", detail: "unexpected status 500" },
    ]);
  });

  it("healthCheck reflects strict single-config rule: any error -> ok:false", async () => {
    const deps: SourceDeps = {
      httpGet: async () => ({ status: 500, body: "" }),
      httpPost: async () => ({ status: 200, body: "" }),
      now,
    };
    const adapter: RepoAdapter = { interpretEntries: () => [] };
    const result = await createGitHubRepoSource(config, adapter).healthCheck(deps);
    expect(result.ok).toBe(false);
    expect(result.checkedAt).toBe(now());
  });
});
