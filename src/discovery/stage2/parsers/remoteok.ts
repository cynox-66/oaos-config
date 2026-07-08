// parsers/remoteok.ts
// File: src/discovery/stage2/parsers/remoteok.ts
// Purpose: Parse a Remote OK alert email into one RawItem per listing.
//
// Detection heuristic (see parse.ts): From: contains "remoteok.com" or
// "remoteok.io" (e.g. Nick@remoteok.com), or the Subject matches
// "remote ok" / "new remote jobs". Body links point at remoteok.com/remote-jobs/
// or remoteok.com/l/.
//
// Listing shape: each card is a job-link anchor (ROLE), followed by the company
// name line, an optional salary line ("💰 $100k – $150k"), and a location line
// ("🌏 Worldwide" / "Remote"). Remote OK listings are remote by definition.

import type { RawItem } from "../../../engines/normalization/types";
import { emailBody, emailDateIso, jobBlocks, looksLikeComp, toRawItem } from "./shared";

const JOB_URL = /remoteok\.(com|io)\/(remote-jobs|l)\//i;
const LOCATION_HINT = /worldwide|remote|anywhere|\b(usa|europe|emea|americas)\b|🌏|🌍|🌎/i;

/**
 * Parse a raw Remote OK alert email (headers + HTML body) into RawItems.
 * Returns an empty array when no job links are present. Pure.
 */
export function parseAlert(rawText: string): RawItem[] {
  const body = emailBody(rawText);
  const fetchedAt = emailDateIso(rawText);

  return jobBlocks(body, JOB_URL).map((block) => {
    const comp = block.lines.find(looksLikeComp) ?? null;
    const rest = block.lines.filter((l) => l !== comp);
    const company = rest[0] ?? null;
    const location = rest.slice(1).find((l) => LOCATION_HINT.test(l)) ?? "Remote";

    return toRawItem(
      {
        company,
        role: block.role || null,
        url: block.url,
        location,
        comp,
        description: [block.role, ...block.lines, "Remote"].filter(Boolean).join(" "),
      },
      "remoteok",
      "job_board",
      fetchedAt
    );
  });
}
