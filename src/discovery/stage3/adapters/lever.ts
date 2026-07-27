// lever.ts
// File: src/discovery/stage3/adapters/lever.ts
// Purpose: CompanyBoardAdapter for the Lever public postings API.

import type { CompanyBoardAdapter, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { SourceFetchError } from "../company-board";

function isPostingArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value);
}

export const leverAdapter: CompanyBoardAdapter = {
  platform: "lever",

  async fetchOne(entry, deps: SourceDeps): Promise<RawItem[]> {
    const url = `https://api.lever.co/v0/postings/${entry.token}?mode=json`;
    const res = await deps.httpGet(url);

    if (res.status !== 200) {
      throw new SourceFetchError("http", `lever ${entry.token}: HTTP ${res.status}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      throw new SourceFetchError("parse", `lever ${entry.token}: response body is not valid JSON`);
    }
    if (!isPostingArray(parsed)) {
      throw new SourceFetchError("shape", `lever ${entry.token}: expected a JSON array of postings`);
    }

    const fetchedAt = deps.now();
    return parsed.map((posting) => ({
      source_type: "job_board",
      source_name: `lever:${entry.token}`,
      url: typeof posting.hostedUrl === "string" ? posting.hostedUrl : null,
      raw_payload: posting,
      fetched_at: fetchedAt,
    }));
  },
};
