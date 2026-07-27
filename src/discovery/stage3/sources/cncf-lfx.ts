// cncf-lfx.ts
// File: src/discovery/stage3/sources/cncf-lfx.ts
// Purpose: CNCF LFX Mentorship — calendar-tracked, NOT parsed into RawItems.
//
// D18 boundary: nothing from this source enters the opportunity pipeline.
// Verified live 2026-07-21: programs/lfx-mentorship/{year}/{term}/project_ideas.md
// is this GitHub repo's own project-listing file — but BOTH the already-
// concluded 01-Mar-May/2026 term and the currently-active 02-Jun-Aug/2026
// term contain only the empty template scaffold (no real projects filled
// in). This is not a timing fluke: the template itself points contributors
// at the external mentorship.lfx.linuxfoundation.org platform, which is the
// real source of truth and out of scope this wave. Parsing this repo
// location would reliably return 0 real projects by construction, so CNCF
// is routed to the calendar sink instead: one reminder entry per term,
// pointing a human at the term's page to check manually.
//
// Year is config, not hardcoded logic — the 2026 -> 2027 rollover is a
// one-line config change, same convention as LFDT (lfdt.ts).
//
// Reuses FetchResult.calendarEntries beyond its original Wave 2 doc comment
// ("populated only by atom_feed sources routed to the calendar sink") — a
// deliberate, non-breaking reuse for a github_repo-family calendar-tracked
// source. The field itself is optional and not type-restricted to one
// family; no frame file was modified to do this.

import { buildAuthHeader, buildContentsApiUrl, parseContentsResponse } from "../github-repo";
import type {
  CalendarEntry,
  FetchResult,
  HealthCheckResult,
  RepoSourceConfig,
  SourceDeps,
  Stage3Source,
} from "../types";

export interface CncfLfxConfig {
  owner: string;
  repo: string;
  year: string;
  enabled: boolean;
}

export const CNCF_LFX_CONFIG: CncfLfxConfig = {
  owner: "cncf",
  repo: "mentoring",
  year: "2026",
  enabled: true,
};

function toRepoSourceConfig(config: CncfLfxConfig): RepoSourceConfig {
  return {
    owner: config.owner,
    repo: config.repo,
    path: `programs/lfx-mentorship/${config.year}`,
    enabled: config.enabled,
  };
}

async function fetchTerms(config: CncfLfxConfig, deps: SourceDeps, token?: string): Promise<FetchResult> {
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

  const calendarEntries: CalendarEntry[] = parsed.entries
    .filter((e) => e.type === "dir")
    .map((e) => ({
      title: `CNCF LFX Mentorship — ${config.year} term ${e.name}`,
      date: null,
      url: `https://github.com/${config.owner}/${config.repo}/tree/main/${e.path}`,
      description:
        "This repo's own project_ideas.md is verified empty for this program (checked 2026-07-21) — " +
        "check mentorship.lfx.linuxfoundation.org directly for the current project list.",
    }));

  return { items: [], errors: [], calendarEntries };
}

export function createCncfLfxSource(
  config: CncfLfxConfig = CNCF_LFX_CONFIG,
  tokenProvider?: () => string | undefined
): Stage3Source {
  return {
    name: `cncf-lfx:${config.year}`,
    family: "github_repo",
    enabled: config.enabled,
    fetch: (deps) => fetchTerms(config, deps, tokenProvider?.()),
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const result = await fetchTerms(config, deps, tokenProvider?.());
      const ok = result.errors.length === 0;
      const count = result.calendarEntries?.length ?? 0;
      return {
        ok,
        checkedAt: deps.now(),
        detail: ok ? `ok, ${count} term(s)` : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
      };
    },
  };
}
