// parsers/shared.ts
// File: src/discovery/stage2/parsers/shared.ts
// Purpose: Pure helpers shared by the per-source alert parsers — email header /
//          body splitting, HTML-to-lines extraction (reusing Engine 1's
//          stripHtml so cleaning stays consistent), per-listing block splitting
//          keyed on job-link anchors, and RawItem packaging.
//
// No network, no LLM, no state — everything here is a pure function of its
// input string(s), so parsers remain deterministic and unit-testable.

import { stripHtml, collapseWhitespace } from "../../../engines/normalization/text";
import type { RawItem, SourceType } from "../../../engines/normalization/types";
import type { AlertSource, ParsedListing } from "../types";

/**
 * Read a single RFC-5322 header value (first match, case-insensitive) from the
 * top of a raw email. Header folding is not fully unfolded — alert emails use
 * single-line From/Subject/Date, which is all detection needs.
 */
export function getHeader(email: string, name: string): string | null {
  const re = new RegExp(`^${name}:[ \\t]*(.+)$`, "im");
  const m = email.match(re);
  return m ? m[1].trim() : null;
}

/** The body of a raw email = everything after the first blank line. */
export function emailBody(email: string): string {
  const sep = email.match(/\r?\n\r?\n/);
  if (!sep || sep.index === undefined) return email;
  return email.slice(sep.index + sep[0].length);
}

/**
 * ISO-8601 timestamp for a RawItem, derived from the email's `Date:` header
 * (pure — a function of the input). Real alert emails always carry a Date
 * header; the current-time fallback only fires on a malformed/absent header.
 */
export function emailDateIso(email: string): string {
  const raw = getHeader(email, "Date");
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Decode the handful of entities that appear in href attributes. */
export function decodeHref(href: string): string {
  return href.replace(/&amp;/gi, "&").trim();
}

/**
 * Convert an HTML fragment into clean text lines, preserving the per-field line
 * structure that email templates encode with block-level tags. Block closers
 * and <br> become newlines; then Engine 1's stripHtml removes remaining tags
 * and decodes entities. Empty lines are dropped.
 */
export function htmlToLines(html: string): string[] {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|td|tr|li|h[1-6]|span|a)>/gi, "\n");
  return stripHtml(withBreaks)
    .split("\n")
    .map((l) => collapseWhitespace(l))
    .filter((l) => l !== "");
}

/** A per-listing block: the job link plus the text lines that follow it. */
export interface JobBlock {
  url: string;
  role: string;
  /** Text lines between this job link and the next (company/location/comp/...). */
  lines: string[];
}

/**
 * Split an email body into one block per job listing. A "listing" is anchored
 * on an <a href> whose URL matches `jobUrlRe`; the block runs from that anchor
 * to the next job anchor (or end of body). This yields multi-listing extraction
 * naturally: N job links → N blocks. `jobUrlRe` MUST be non-global (used with
 * .test()).
 */
export function jobBlocks(body: string, jobUrlRe: RegExp): JobBlock[] {
  const anchorRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const hits: { href: string; role: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(body)) !== null) {
    const href = decodeHref(m[1]);
    if (jobUrlRe.test(href)) {
      hits.push({
        href,
        role: collapseWhitespace(stripHtml(m[2])),
        start: m.index,
        end: anchorRe.lastIndex,
      });
    }
  }
  return hits.map((hit, i) => {
    const next = hits[i + 1];
    const slice = body.slice(hit.end, next ? next.start : body.length);
    return { url: hit.href, role: hit.role, lines: htmlToLines(slice) };
  });
}

const COMP_RE =
  /[$₹€£]\s?\d|\bper\s+(hour|year|month)\b|\/(hr|yr|hour|year|mo)\b|\bhourly\b|\bfixed[-\s]?price\b|\bsalary\b|\d[\d,]*\s?[-–]\s?[$₹€£]?\d/i;

/** True when a text line looks like a compensation string. */
export function looksLikeComp(line: string): boolean {
  return COMP_RE.test(line);
}

/**
 * Package a {@link ParsedListing} into a canonical {@link RawItem} whose
 * structured payload maps 1:1 onto the fields the Engine 1 `job_board` adapter
 * reads (company / role / description / location / comp). This is the seam:
 * Stage 2 stops here; normalize() + runPipeline take over unchanged.
 */
export function toRawItem(
  listing: ParsedListing,
  source: AlertSource,
  sourceType: SourceType,
  fetchedAt: string
): RawItem {
  return {
    source_type: sourceType,
    source_name: source,
    url: listing.url,
    fetched_at: fetchedAt,
    raw_payload: {
      company: listing.company,
      role: listing.role,
      description: listing.description ?? "",
      location: listing.location,
      comp: listing.comp,
    },
  };
}
