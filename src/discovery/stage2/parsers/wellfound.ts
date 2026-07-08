// parsers/wellfound.ts
// File: src/discovery/stage2/parsers/wellfound.ts
// Purpose: Parse a Wellfound (formerly AngelList Talent) startup-jobs alert
//          into one RawItem per listing.
//
// Detection heuristic (see parse.ts): From: contains "wellfound.com" or
// "angel.co" (e.g. team@hi.wellfound.com), or the Subject matches
// "startup jobs" / "new roles". Body links point at wellfound.com/jobs,
// wellfound.com/l/, or angel.co/.../jobs.
//
// Listing shape: each card is a job-link anchor (ROLE), followed by the company
// name line, a location line, and an optional comp/equity line (e.g.
// "$120k – $160k · 0.1% – 0.5%").

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, looksLikeComp, toRawItem } from "./shared";

const JOB_URL = /(wellfound\.com\/(jobs|l)\/|angel\.co\/[^"]*\/jobs)/i;

/**
 * Parse a raw Wellfound startup-jobs alert email (headers + HTML body) into
 * RawItems. Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
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
      "wellfound",
      "job_board",
      fetchedAt
    );
  });
}
