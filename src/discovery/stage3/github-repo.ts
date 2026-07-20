// github-repo.ts
// File: src/discovery/stage3/github-repo.ts
// Purpose: The github_repo family — Contents API URL construction, directory-
//          listing parsing, and the adapter hook a concrete source (CNCF LFX,
//          ESoC, LFDT; Wave 4) implements to turn entries into RawItems.
//          Single-config family: any failure is total failure, so
//          healthCheck uses the strict ok = (errors.length === 0) rule.

import type { RawItem } from "../../engines/normalization/types";
import type {
  ContentsApiEntry,
  FetchResult,
  HealthCheckResult,
  RepoAdapter,
  RepoSourceConfig,
  SourceDeps,
  SourceError,
  Stage3Source,
} from "./types";

export function buildContentsApiUrl(config: RepoSourceConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
}

export function buildAuthHeader(token?: string): Record<string, string> | undefined {
  return token ? { Authorization: `token ${token}` } : undefined;
}

interface ContentsEntryShape {
  name: string;
  path: string;
  type: string;
  sha: string;
  download_url?: unknown;
}

function isContentsEntryShape(raw: unknown): raw is ContentsEntryShape {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as Record<string, unknown>).name === "string" &&
    typeof (raw as Record<string, unknown>).path === "string" &&
    typeof (raw as Record<string, unknown>).type === "string" &&
    typeof (raw as Record<string, unknown>).sha === "string"
  );
}

export function parseContentsResponse(
  response: { status: number; body: string },
  scope: string
): { entries: ContentsApiEntry[] } | { error: SourceError } {
  if (response.status !== 200) {
    return { error: { scope, kind: "http", detail: `unexpected status ${response.status}` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return { error: { scope, kind: "shape", detail: "response body is not valid JSON" } };
  }

  if (!Array.isArray(parsed)) {
    return { error: { scope, kind: "shape", detail: "expected an array of directory entries" } };
  }

  const entries: ContentsApiEntry[] = [];
  for (const raw of parsed) {
    if (!isContentsEntryShape(raw)) {
      return { error: { scope, kind: "shape", detail: "entry missing required string fields" } };
    }
    entries.push({
      name: raw.name,
      path: raw.path,
      type: raw.type,
      sha: raw.sha,
      download_url: typeof raw.download_url === "string" ? raw.download_url : null,
    });
  }

  return { entries };
}

async function fetchRepo(
  config: RepoSourceConfig,
  adapter: RepoAdapter,
  deps: SourceDeps,
  token?: string
): Promise<FetchResult> {
  const scope = `${config.owner}/${config.repo}:${config.path}`;
  const url = buildContentsApiUrl(config);
  const headers = buildAuthHeader(token);

  let response;
  try {
    response = await deps.httpGet(url, headers);
  } catch (err) {
    return { items: [], errors: [{ scope, kind: "http", detail: err instanceof Error ? err.message : String(err) }] };
  }

  const parsed = parseContentsResponse(response, scope);
  if ("error" in parsed) {
    return { items: [], errors: [parsed.error] };
  }

  const items: RawItem[] = adapter.interpretEntries(parsed.entries, config);
  return { items, errors: [] };
}

export function createGitHubRepoSource(
  config: RepoSourceConfig,
  adapter: RepoAdapter,
  tokenProvider?: () => string | undefined
): Stage3Source {
  return {
    name: `github:${config.owner}/${config.repo}`,
    family: "github_repo",
    enabled: config.enabled,
    fetch: (deps) => fetchRepo(config, adapter, deps, tokenProvider?.()),
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const result = await fetchRepo(config, adapter, deps, tokenProvider?.());
      const ok = result.errors.length === 0;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok
          ? `ok, ${result.items.length} items`
          : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
