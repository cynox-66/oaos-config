// greenhouse.ts
// File: src/discovery/stage3/adapters/greenhouse.ts
// Purpose: CompanyBoardAdapter for the Greenhouse Job Board API.

import type { CompanyBoardAdapter, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";
import { SourceFetchError } from "../company-board";

interface GreenhouseResponse {
  jobs: Record<string, unknown>[];
}

function isGreenhouseResponse(value: unknown): value is GreenhouseResponse {
  return typeof value === "object" && value !== null && Array.isArray((value as { jobs?: unknown }).jobs);
}

function buildUrl(token: string, withContent: boolean): string {
  const base = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
  return withContent ? `${base}?content=true` : base;
}

function parseJobs(body: string, token: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SourceFetchError("parse", `greenhouse ${token}: response body is not valid JSON`);
  }
  if (!isGreenhouseResponse(parsed)) {
    throw new SourceFetchError("shape", `greenhouse ${token}: expected { jobs: [...] }`);
  }
  return parsed.jobs;
}

/** Greenhouse's `location` is `{ name: string }`, not a string — extract the name. */
function locationName(job: Record<string, unknown>): string | undefined {
  const location = job.location;
  if (location !== null && typeof location === "object") {
    const name = (location as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

export const greenhouseAdapter: CompanyBoardAdapter = {
  platform: "greenhouse",

  async fetchOne(entry, deps: SourceDeps): Promise<RawItem[]> {
    let res = await deps.httpGet(buildUrl(entry.token, true));

    // Some boards reject ?content=true; fall back to the plain listing rather than
    // failing the whole entry. This is a silent degrade, not a recorded SourceError:
    // jobs fetched without descriptions still carry their url, so Engine 1's
    // completeness scoring flags them needs_enrichment and the existing
    // research/enrichment pipeline step fills the description from the posting URL.
    // The "content unavailable" signal surfaces where it matters (enrichment) without
    // needing a side-channel CompanyBoardAdapter.fetchOne doesn't have.
    if (res.status !== 200) {
      res = await deps.httpGet(buildUrl(entry.token, false));
      if (res.status !== 200) {
        throw new SourceFetchError(
          "http",
          `greenhouse ${entry.token}: HTTP ${res.status} (content=true and plain listing both failed)`
        );
      }
    }

    const jobs = parseJobs(res.body, entry.token);
    const fetchedAt = deps.now();

    return jobs.map((job) => ({
      source_type: "job_board",
      source_name: `greenhouse:${entry.token}`,
      url: typeof job.absolute_url === "string" ? job.absolute_url : null,
      raw_payload: {
        ...job,
        // Greenhouse's own key is `content`; Engine 1's job_board adapter
        // (extractFromObject, src/engines/normalization/adapters/job_board.ts)
        // reads description from ["description","desc","body","details","summary"].
        // `content` isn't one of them, so a plain spread leaves every Greenhouse
        // posting's description unread. Add it under a key Engine 1 already
        // checks; leave `content` in place (via the spread above) — additive
        // only, nothing dropped or overwritten.
        description: typeof job.content === "string" ? job.content : undefined,
        // `place` (NOT `location`) is deliberate. extractFromObject's location
        // key list is ["location","city","place","region"] — `location` is
        // checked FIRST. Greenhouse's `location` holds an OBJECT ({ name }),
        // which readString skips (string/number only), so writing the derived
        // string to `location` here would either collide with or, worse,
        // overwrite that object. `place` is read only after `location` and
        // `city` both fail, so it's a safe, silent fallthrough — and the
        // original `location` object survives untouched via the spread above.
        // If job_board.ts's key list is ever reordered or `place` is pruned
        // from it, this mapping breaks silently — re-check this comment first.
        place: locationName(job),
      },
      fetched_at: fetchedAt,
    }));
  },
};
