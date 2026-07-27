// workday.ts
// File: src/discovery/stage3/adapters/workday.ts
// Purpose: CompanyBoardAdapter for the Workday CXS job-search API.

import type { CompanyBoardAdapter, CompanyRegistryEntry, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { SourceFetchError } from "../company-board";

const PAGE_LIMIT = 20;
const SAFETY_CEILING = 500;

// CompanyRegistryEntry has no "base" field (frame is frozen this wave) and the
// wdN subdomain is assigned per Workday tenant, not derivable from the token.
// This map is the adapter's own knowledge of where each known tenant lives —
// analogous to Greenhouse/Lever hardcoding their own API host.
const TENANT_BASE_URL: Record<string, string> = {
  redhat: "https://redhat.wd5.myworkdayjobs.com",
};

interface WorkdayJobPosting {
  externalPath?: unknown;
  [key: string]: unknown;
}

interface WorkdayResponse {
  total: number;
  jobPostings: WorkdayJobPosting[];
}

function isWorkdayResponse(value: unknown): value is WorkdayResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { total?: unknown; jobPostings?: unknown };
  return typeof v.total === "number" && Array.isArray(v.jobPostings);
}

function requireBase(entry: CompanyRegistryEntry): string {
  const base = TENANT_BASE_URL[entry.token];
  if (!base) {
    throw new SourceFetchError("shape", `workday ${entry.token}: no known base URL for this tenant`);
  }
  return base;
}

export const workdayAdapter: CompanyBoardAdapter = {
  platform: "workday",

  async fetchOne(entry, deps: SourceDeps): Promise<RawItem[]> {
    if (!entry.site) {
      throw new SourceFetchError("shape", `workday ${entry.token}: registry entry is missing required "site"`);
    }
    const base = requireBase(entry);
    const url = `${base}/wday/cxs/${entry.token}/${entry.site}/jobs`;
    const fetchedAt = deps.now();

    const items: RawItem[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total && offset < SAFETY_CEILING) {
      const res = await deps.httpPost(url, {
        appliedFacets: {},
        limit: PAGE_LIMIT,
        offset,
        searchText: "",
      });

      if (res.status !== 200) {
        throw new SourceFetchError("http", `workday ${entry.token}: HTTP ${res.status} at offset ${offset}`);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(res.body);
      } catch {
        throw new SourceFetchError("parse", `workday ${entry.token}: response body is not valid JSON at offset ${offset}`);
      }
      if (!isWorkdayResponse(parsed)) {
        throw new SourceFetchError("shape", `workday ${entry.token}: expected { total, jobPostings } at offset ${offset}`);
      }

      total = parsed.total;
      for (const job of parsed.jobPostings) {
        items.push({
          source_type: "job_board",
          source_name: `workday:${entry.token}`,
          url: typeof job.externalPath === "string" ? `${base}/${entry.site}${job.externalPath}` : null,
          raw_payload: job,
          fetched_at: fetchedAt,
        });
      }
      offset += PAGE_LIMIT;
    }

    if (offset >= SAFETY_CEILING && offset < total) {
      throw new SourceFetchError(
        "shape",
        `workday ${entry.token}: safety ceiling ${SAFETY_CEILING} reached before total ${total} collected (got ${items.length} items)`
      );
    }

    return items;
  },
};
