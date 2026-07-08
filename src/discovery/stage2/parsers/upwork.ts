// parsers/upwork.ts
// File: src/discovery/stage2/parsers/upwork.ts
// Purpose: Parse an Upwork saved-search / job-alert email into one RawItem per
//          listing. This is the FREELANCE source (source_type "freelance" →
//          Engine 1 assigns the Freelance category).
//
// Detection heuristic (see parse.ts): From: contains "upwork.com"
// (e.g. do-not-reply@upwork.com), or the Subject matches
// "new job(s)" / "saved search" AND the body links at upwork.com/jobs or
// upwork.com/nx/jobs.
//
// Listing shape: each card is a job-link anchor (ROLE), followed by a
// budget/rate line ("Hourly: $30–$50" or "Fixed-Price: $1,500"), a
// "Client: <name> (<country>)" line when the client is named, and a short
// description snippet. Upwork consumer posts often omit the client name — then
// company is null (Engine 1's needs_enrichment handles it).

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, looksLikeComp, toRawItem } from "./shared";

const JOB_URL = /upwork\.com\/(jobs|nx\/jobs|freelance-jobs|ab\/jobs)\//i;
const CLIENT_LINE = /^client:\s*(.+?)(?:\s*\(([^)]+)\))?$/i;

/**
 * Parse a raw Upwork job-alert email (headers + HTML body) into RawItems.
 * Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
    const comp = block.lines.find(looksLikeComp) ?? null;

    // Client line → company (+ country as location when present).
    let company: string | null = null;
    let location: string | null = null;
    for (const line of block.lines) {
      const m = line.match(CLIENT_LINE);
      if (m) {
        company = m[1].trim() || null;
        location = m[2]?.trim() ?? null;
        break;
      }
    }

    return toRawItem(
      {
        company,
        role: block.role || null,
        url: block.url,
        location,
        comp,
        description: [block.role, ...block.lines].filter(Boolean).join(" "),
      },
      "upwork",
      "freelance",
      fetchedAt
    );
  });
}
