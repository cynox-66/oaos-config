// parsers/weworkremotely.ts
// File: src/discovery/stage2/parsers/weworkremotely.ts
// Purpose: Parse a We Work Remotely digest email into one RawItem per listing.
//
// Detection heuristic (see parse.ts): From: contains "weworkremotely.com"
// (e.g. hello@weworkremotely.com), or the Subject matches
// "we work remotely" / "remote jobs". Body links point at
// weworkremotely.com/remote-jobs/ or weworkremotely.com/listings/.
//
// Listing shape: each card is a job-link anchor (ROLE), followed by the company
// name line and a region line ("Anywhere in the World", "USA Only", ...). WWR
// listings are remote by definition; the region line carries any restriction.

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, toRawItem } from "./shared";

const JOB_URL = /weworkremotely\.com\/(remote-jobs|listings)\//i;

/**
 * Parse a raw We Work Remotely digest email (headers + HTML body) into
 * RawItems. Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
    const company = block.lines[0] ?? null;
    // Region line, if present; otherwise the listing is simply "Remote".
    const location = block.lines[1] ?? "Remote";

    return toRawItem(
      {
        company,
        role: block.role || null,
        url: block.url,
        location,
        comp: null,
        description: [block.role, ...block.lines, "Remote"].filter(Boolean).join(" "),
      },
      "weworkremotely",
      "job_board",
      fetchedAt
    );
  });
}
