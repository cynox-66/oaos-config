// lfdt.ts
// File: src/discovery/stage3/sources/lfdt.ts
// Purpose: LFDT (LF Decentralized Trust) Mentorship — calendar-tracked, NOT
//          parsed into RawItems.
//
// D18 boundary: nothing from this source enters the opportunity pipeline.
// Verified live 2026-07-21: docs/projects/{year}.md is a well-structured
// markdown table (29 real projects for 2026, across a paid section and a
// "🔵 Unpaid Mentorships" section) — but the Wave 2 github_repo frame
// (RepoAdapter/createGitHubRepoSource) only ever fetches ONE directory
// listing and hands entry METADATA (name/path/sha/download_url, no content)
// to the adapter; it structurally cannot reach a file's content, and the
// Contents API rejects a single-file path outright (returns an object, not
// an array — parseContentsResponse treats that as a shape error by
// design). Building a per-project parser here would require either
// fetching file content outside the frame's single-call design or
// extending the frame again for a second time this wave. The operator's
// call was to route LFDT to the calendar sink instead: one reminder entry
// pointing a human at the current year's table.
//
// Year is config, not hardcoded logic — the 2026 -> 2027 rollover is a
// one-line config change, same convention as CNCF (cncf-lfx.ts).

import { buildAuthHeader, buildContentsApiUrl, parseContentsResponse } from "../github-repo";
import type {
  CalendarEntry,
  FetchResult,
  HealthCheckResult,
  RepoSourceConfig,
  SourceDeps,
  Stage3Source,
} from "../types";

export interface LfdtConfig {
  owner: string;
  repo: string;
  year: string;
  enabled: boolean;
}

export const LFDT_CONFIG: LfdtConfig = {
  owner: "LF-Decentralized-Trust-Mentorships",
  repo: "mentorship-program",
  year: "2026",
  enabled: true,
};

function toRepoSourceConfig(config: LfdtConfig): RepoSourceConfig {
  return {
    owner: config.owner,
    repo: config.repo,
    path: "docs/projects",
    enabled: config.enabled,
  };
}

async function fetchYearFile(config: LfdtConfig, deps: SourceDeps, token?: string): Promise<FetchResult> {
  const repoConfig = toRepoSourceConfig(config);
  const scope = `${config.owner}/${config.repo}:${repoConfig.path}`;
  const url = buildContentsApiUrl(repoConfig);
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

  const fileName = `${config.year}.md`;
  const entry = parsed.entries.find((e) => e.name === fileName);
  if (!entry) {
    return { items: [], errors: [{ scope, kind: "shape", detail: `no ${fileName} found under docs/projects` }] };
  }

  const calendarEntries: CalendarEntry[] = [
    {
      title: `LFDT Mentorship Program — ${config.year} project table`,
      date: null,
      url: `https://github.com/${config.owner}/${config.repo}/blob/main/${entry.path}`,
      description: "Review the current year's mentorship project table (a markdown table of mentee projects).",
    },
  ];

  return { items: [], errors: [], calendarEntries };
}

export function createLfdtSource(
  config: LfdtConfig = LFDT_CONFIG,
  tokenProvider?: () => string | undefined
): Stage3Source {
  return {
    name: `lfdt:${config.year}`,
    family: "github_repo",
    enabled: config.enabled,
    fetch: (deps) => fetchYearFile(config, deps, tokenProvider?.()),
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const result = await fetchYearFile(config, deps, tokenProvider?.());
      const ok = result.errors.length === 0;
      const count = result.calendarEntries?.length ?? 0;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok ? `ok, ${count} entry` : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
