// parsers/indeed.ts
// File: src/discovery/stage2/parsers/indeed.ts
// Purpose: Parse an Indeed "job alert" email into one RawItem per listing.
//
// Detection heuristic (see parse.ts): From: contains "indeed.com"
// (e.g. alert@indeed.com / donotreply@indeed.com), or the Subject matches
// "new job(s)" / "job alert". Body links point at indeed.com/rc/clk,
// indeed.com/viewjob, or indeed.com/pagead.
//
// Listing shape: each card is a job-link anchor (ROLE), followed by separate
// lines for company, location, and an optional salary line.

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, looksLikeComp, toRawItem } from "./shared";

const JOB_URL = /indeed\.com\/(rc\/clk|viewjob|pagead|job)/i;

/**
 * Parse a raw Indeed job-alert email (headers + HTML body) into RawItems.
 * Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
    // Indeed cards list company then location on their own lines; salary, when
    // shown, is a separate line detected by shape (not position).
    const comp = block.lines.find(looksLikeComp) ?? null;
    const nonComp = block.lines.filter((l) => l !== comp);
    const company = nonComp[0] ?? null;
    const location = nonComp[1] ?? null;

    return toRawItem(
      {
        company,
        role: block.role || null,
        url: block.url,
        location,
        comp,
        description: [block.role, ...block.lines].filter(Boolean).join(" "),
      },
      "indeed",
      "job_board",
      fetchedAt
    );
  });
}
