// text.ts
// File: src/engines/normalization/text.ts
// Purpose: Pure text utilities — HTML stripping, whitespace collapse, and the
//          description_raw → description_norm cleaning pipeline.

import { BOILERPLATE_BLOCKLIST } from "./config";

/** Max length of the stored raw description (spec: trimmed, max 5000 chars). */
export const MAX_DESCRIPTION_CHARS = 5000;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Remove `<script>`/`<style>` blocks, all tags, and decode common entities. */
export function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? " ");
}

/** Collapse any run of whitespace to a single space and trim. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** Trim and truncate to {@link MAX_DESCRIPTION_CHARS} for description_raw. */
export function toDescriptionRaw(input: string): string {
  return input.trim().slice(0, MAX_DESCRIPTION_CHARS);
}

/**
 * Clean a raw description into description_norm: strip HTML, remove known
 * boilerplate, collapse whitespace. Pure and deterministic.
 */
export function cleanDescription(raw: string): string {
  let out = stripHtml(raw);
  for (const pattern of BOILERPLATE_BLOCKLIST) {
    out = out.replace(pattern, " ");
  }
  return collapseWhitespace(out);
}
