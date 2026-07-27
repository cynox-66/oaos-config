// ashby.ts
// File: src/discovery/stage3/adapters/ashby.ts
// Purpose: CompanyBoardAdapter for the public Ashby Job Board posting API.
//
// URL form resolved Wave 3 (Step 1 gate, 2026-07-20): the public board page
// (jobs.ashbyhq.com/{token}) is a client-rendered SPA and doesn't expose the
// data-fetch URL statically, so this uses Ashby's documented no-auth public
// Job Board API instead. Confirmed live against signoz + hashgraph in Step 2.

import type { CompanyBoardAdapter, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { SourceFetchError } from "../company-board";

interface AshbyResponse {
  jobs: Record<string, unknown>[];
}

function isAshbyResponse(value: unknown): value is AshbyResponse {
  return typeof value === "object" && value !== null && Array.isArray((value as { jobs?: unknown }).jobs);
}

export const ashbyAdapter: CompanyBoardAdapter = {
  platform: "ashby",

  async fetchOne(entry, deps: SourceDeps): Promise<RawItem[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${entry.token}`;
    const res = await deps.httpGet(url);

    if (res.status !== 200) {
      throw new SourceFetchError("http", `ashby ${entry.token}: HTTP ${res.status}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      throw new SourceFetchError("parse", `ashby ${entry.token}: response body is not valid JSON`);
    }
    if (!isAshbyResponse(parsed)) {
      throw new SourceFetchError("shape", `ashby ${entry.token}: expected { jobs: [...] }`);
    }

    const fetchedAt = deps.now();
    return parsed.jobs.map((job) => ({
      source_type: "job_board",
      source_name: `ashby:${entry.token}`,
      url:
        typeof job.jobUrl === "string"
          ? job.jobUrl
          : typeof job.applyUrl === "string"
            ? job.applyUrl
            : null,
      raw_payload: job,
      fetched_at: fetchedAt,
    }));
  },
};
