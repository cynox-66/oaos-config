// text.ts
// File: src/discovery/prerank/text.ts
// Purpose: Pure text extraction, cleaning, tokenization, and term matching
//          helpers for the Prerank Gate. No I/O of any kind.

import { MAX_PAYLOAD_DEPTH } from "./config";
import type { RawItem } from "../../engines/normalization/types";

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0*39;/g, "'"],
  [/&apos;/g, "'"],
];

/**
 * Collect every string-valued leaf out of an unknown payload shape. Sources
 * vary, so no schema is assumed: objects and arrays are walked to a fixed
 * depth and non-string leaves (numbers, booleans, null) are ignored.
 */
function collectStrings(value: unknown, depth: number, out: string[]): void {
  if (depth > MAX_PAYLOAD_DEPTH) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, depth + 1, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, depth + 1, out);
    }
  }
}

/** Strip HTML tags, decode a minimal entity set, lowercase, collapse whitespace. */
export function cleanText(raw: string): string {
  let text = raw.replace(/<[^>]*>/g, " ");
  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement);
  }
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Best-available text for an item, drawn from `raw_payload` only. `url` and
 * `source_name` are deliberately excluded — URL slugs would inject spurious
 * vocabulary matches that no human wrote.
 */
export function extractText(item: RawItem): string {
  const payload = item.raw_payload;
  if (typeof payload === "string") return cleanText(payload);
  const parts: string[] = [];
  collectStrings(payload, 0, parts);
  return cleanText(parts.join(" "));
}

/** Split cleaned text into alphanumeric tokens (`+`, `#`, `/` kept inside words). */
export function tokenize(cleaned: string): string[] {
  const matches = cleaned.match(/[a-z0-9][a-z0-9+#/._-]*/g);
  return matches ?? [];
}

/**
 * Does `term` occur in `cleaned` with word boundaries on both sides?
 * Works uniformly for single tokens ("ebpf") and phrases ("site reliability"),
 * so "sre" does not match inside "stressed".
 */
export function termPresent(cleaned: string, term: string): boolean {
  const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === "") return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(cleaned);
}

/** Which of `terms` occur in `cleaned`. Order follows `terms`; duplicates dropped. */
export function matchedTerms(cleaned: string, terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    if (termPresent(cleaned, normalized)) out.push(normalized);
  }
  return out;
}
