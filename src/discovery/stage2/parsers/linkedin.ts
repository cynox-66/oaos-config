// parsers/linkedin.ts
// File: src/discovery/stage2/parsers/linkedin.ts
// Purpose: Parse a LinkedIn "Jobs" digest email into one RawItem per listing.
//
// Detection heuristic (see parse.ts): From: contains "linkedin.com"
// (e.g. jobs-noreply@linkedin.com / jobalerts-noreply@linkedin.com), or the
// Subject matches "job(s) for you" / "new jobs". Body links point at
// linkedin.com/jobs/view or linkedin.com/comm/jobs/view.
//
// Listing shape: each job card is a job-link anchor whose text is the ROLE,
// followed by a "Company · Location" line (LinkedIn's middot separator) and an
// optional salary line.

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, looksLikeComp, toRawItem } from "./shared";

const JOB_URL = /linkedin\.com\/(comm\/)?jobs\/view\//i;

/**
 * Parse a raw LinkedIn Jobs alert email (headers + HTML body) into RawItems.
 * Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
    const [first, ...rest] = block.lines;
    let company: string | null = null;
    let location: string | null = null;
    if (first) {
      const parts = first
        .split(/\s[·|]\s/)
        .map((s) => s.trim())
        .filter(Boolean);
      company = parts[0] ?? null;
      location = parts[1] ?? null;
    }
    const comp = block.lines.find(looksLikeComp) ?? null;

    return toRawItem(
      {
        company,
        role: block.role || null,
        url: block.url,
        location,
        comp,
        description: [block.role, ...block.lines].filter(Boolean).join(" "),
      },
      "linkedin",
      "job_board",
      fetchedAt
    );
  });
}
