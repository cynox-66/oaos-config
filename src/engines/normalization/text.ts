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

/**
 * Remove `<script>`/`<style>` blocks, all tags, and decode common entities.
 *
 * Entities are decoded FIRST, then tags stripped — not the reverse. Some real
 * sources (confirmed live: Greenhouse's `content` field) return HTML-entity-
 * escaped markup (`&lt;div&gt;`, not `<div>`); decoding after stripping is a
 * no-op on that input (there are no literal `<`/`>` for the tag-strip regex to
 * match), so the entities decode LAST and reconstitute literal tags with
 * nothing left downstream to remove them — description_norm then contains raw
 * markup. Decoding first fixes this. On already-literal HTML (this function's
 * original target shape) decoding first changes nothing before stripping,
 * since there's nothing to decode inside the tags themselves — verified by
 * test to produce byte-identical output to the pre-reorder behavior.
 *
 * Side effect of the reorder, deliberately accepted: text that merely
 * *mentions* an escaped `&lt;script&gt;...&lt;/script&gt;` (or `&lt;style&gt;`)
 * block — not a real script tag, just escaped text describing one — now
 * decodes to a literal `<script>...</script>` before the script-block regex
 * runs, and that regex deletes the ENTIRE block including its inner text (by
 * design, for real script/style blocks). Previously this text would "leak" as
 * literal, unremoved markup in description_norm instead. This is normalization
 * for scoring text, not rendering to a browser, so the risk is cosmetic
 * content loss in a rare case, not a security concern — but it is a real
 * behavior change on that specific input shape, not just a formatting fix.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/&[#a-z0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
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
