// esoc.ts
// File: src/discovery/stage3/sources/esoc.ts
// Purpose: ESoC (European Summer of Code) concrete github_repo source.
//          RepoAdapter over european-summer-of-code/esoc2026's "cards/"
//          directory. Confirmed live 2026-07-21: each file under cards/ is
//          one project proposal card (e.g. "pyaptamer.md", "shap.md");
//          "gcos-esoc2026-batches.md" is a schedule/batch index, not a
//          project, and is excluded by filename. No content fetch — the
//          existing research/enrichment pipeline step fills in the
//          description from the card's own URL, same self-correcting
//          pattern as the Greenhouse fallback (see stage3/adapters/greenhouse.ts).
//          Repo name is config, not hardcoded logic — the next cohort's repo
//          rename (e.g. esoc2027) is a one-line config change.

import type { ContentsApiEntry, RepoAdapter, RepoSourceConfig } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { createGitHubRepoSource } from "../github-repo";

const NON_PROJECT_FILE_PATTERN = /batches/i;

function isProjectCard(entry: ContentsApiEntry): boolean {
  return entry.type === "file" && entry.name.endsWith(".md") && !NON_PROJECT_FILE_PATTERN.test(entry.name);
}

export const esocAdapter: RepoAdapter = {
  interpretEntries(entries, config, deps): RawItem[] {
    const fetchedAt = deps.now();
    return entries.filter(isProjectCard).map((entry) => ({
      source_type: "oss",
      source_name: "esoc",
      raw_payload: entry,
      url: entry.download_url ?? `https://github.com/${config.owner}/${config.repo}/blob/main/${entry.path}`,
      fetched_at: fetchedAt,
    }));
  },
};

export const ESOC_CONFIG: RepoSourceConfig = {
  owner: "european-summer-of-code",
  repo: "esoc2026",
  path: "cards",
  enabled: true,
};

export function createEsocSource(config: RepoSourceConfig = ESOC_CONFIG, tokenProvider?: () => string | undefined) {
  return createGitHubRepoSource(config, esocAdapter, tokenProvider);
}
