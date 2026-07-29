// truncation.ts
// File: src/discovery/stage3/query/truncation.ts
// Purpose: The CONTENT QUARANTINE — how a source that only ever receives
//          truncated text stops that text from presenting as usable content
//          downstream. Pure; no I/O.
//
// ── Why this exists (Wave 5, operator ruling) ───────────────────────────────
// Two Wave 5 sources cannot return a full job description:
//   Adzuna   — every description is EXACTLY 500 chars, cut mid-sentence with a
//              visible "…" (live-confirmed 2026-07-28, 11/11 sampled).
//   freehire — every description clusters at ~1000 chars (min 956, median 995,
//              max 1002 across 100 sampled) with NO truncation marker at all.
//              Silent truncation is arguably the more dangerous of the two: it
//              looks like real content right up until it matters.
//
// ── Why it works the way it does ────────────────────────────────────────────
// Engine 1 exposes NO settable content marker. `RawItem` has five fields and
// none of them is a flag; `needs_enrichment` is COMPUTED by normalize.ts
// (`completeness < 0.4`) from a formula that does not consider the description
// at all. So there is nothing to "set". What exists instead is an ASYMMETRY:
//
//   • Engine 1's job_board adapter reads a description ONLY from these
//     TOP-LEVEL payload keys: description, desc, body, details, summary
//     (adapters/shared.ts `readString` indexes `payload[key]` — top level only).
//   • The prerank gate's `extractText` harvests EVERY string leaf of the
//     payload at any depth, regardless of key name.
//
// Quarantine exploits exactly that gap. The original source record is nested
// UNTOUCHED under `source_record`, where the adapter cannot reach its
// `description` but prerank can still read every word of it. The truncated
// text is additionally surfaced at the top level under `description_truncated`
// — a key the adapter does not read — so a human inspecting the payload sees
// it plainly.
//
// Net effect: the truncated text SCORES for relevance and is never LOST, but
// `description_raw` / `description_norm` come out EMPTY, so no downstream
// engine can mistake half a posting for the posting.
//
// ── The invariant, enforced not assumed ─────────────────────────────────────
// `quarantineContent` THROWS if the caller's own top-level fields include any
// key Engine 1 reads as a description. A future edit that adds `summary` to a
// lifted field set fails loudly here rather than silently un-quarantining a
// whole source.

/**
 * The TOP-LEVEL payload keys Engine 1's job_board adapter will accept as a
 * description, in its own precedence order. Mirrors
 * `src/engines/normalization/adapters/job_board.ts`. If that list ever changes,
 * this one must change with it — the quarantine is only as good as this list.
 */
export const ADAPTER_CONTENT_KEYS = ["description", "desc", "body", "details", "summary"] as const;

/** Where a quarantined item's text came from, and why it cannot be trusted. */
export type ContentSource =
  | "adzuna:search-api-500char"
  | "freehire:search-api-1k-cap";

export class QuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuarantineError";
  }
}

/** A payload whose truncated text is structurally unreachable as content. */
export interface QuarantinedPayload {
  /** Always true. Marks the item as carrying partial content only. */
  content_truncated: true;
  /** Which source and cap produced the truncation. */
  content_source: ContentSource;
  /** The truncated text, under a key Engine 1 does not read as a description. */
  description_truncated: string;
  /** The original source record, nested and untouched. */
  source_record: unknown;
  [key: string]: unknown;
}

/**
 * Build a quarantined payload.
 *
 * @param lifted    top-level fields the adapter SHOULD read — company, title,
 *                  location, salary, and so on. Lifting these matters: Engine
 *                  1's fingerprint is sha1(company|role|url-host), so a payload
 *                  with no readable company/role collapses distinct postings
 *                  onto one fingerprint.
 * @param text      the truncated description text.
 * @param source    which cap produced it.
 * @param original  the source's own record, preserved verbatim.
 * @throws {QuarantineError} if `lifted` carries a key Engine 1 reads as a
 *         description — that would defeat the quarantine.
 */
export function quarantineContent(
  lifted: Record<string, unknown>,
  text: string,
  source: ContentSource,
  original: unknown
): QuarantinedPayload {
  for (const key of ADAPTER_CONTENT_KEYS) {
    if (key in lifted) {
      throw new QuarantineError(
        `quarantine defeated: lifted field "${key}" is read by Engine 1's job_board adapter as a ` +
          `description. Truncated content must never be reachable at the top level — nest it under ` +
          `source_record or rename the field.`
      );
    }
  }

  return {
    ...lifted,
    content_truncated: true,
    content_source: source,
    description_truncated: text,
    source_record: original,
  };
}
