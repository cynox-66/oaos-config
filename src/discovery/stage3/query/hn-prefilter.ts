// hn-prefilter.ts
// File: src/discovery/stage3/query/hn-prefilter.ts
// Purpose: The HN structural constraint — a pure lexical prefilter over RAW
//          comment text that runs BEFORE any parse. Pure; no I/O, no LLM.
//
// ── Why a prefilter at all ──────────────────────────────────────────────────
// A "Who is hiring?" thread is ~276 top-level comments (July 2026, measured),
// averaging ~1,373 chars each. Only 34 of those 276 mentioned any of
// kubernetes / SRE / devops / platform-engineering — an ~8x reduction. Every
// comment that survives costs prerank budget and, downstream, the pipeline's
// ~4 Gemini calls per item. Filtering on raw text first is the cheapest
// possible gate: a regex over a string the source already has in hand.
//
// STANDING INVARIANT (Wave 5): nothing downstream of this filter ever sees a
// non-matching comment. `prefilterComments` is the ONLY path from thread
// children to RawItems in sources/hn-hiring.ts — there is no second route that
// builds an item without passing through here.
//
// ── What it deliberately does NOT do ────────────────────────────────────────
// It does not parse the "Company | Role | Location" convention, score
// relevance, or classify. Phase 0c established that convention is directional,
// not rigid (field order and count vary per poster). Adapters transport;
// prerank ranks. A surviving comment becomes a RawItem carrying its raw text,
// and prerank decides whether it is worth spending anything on.

/** Strip HTML tags and decode the entity set HN's Algolia API emits. */
export function decodeCommentText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does `term` occur in `cleaned` (already lowercased) on word boundaries?
 * Mirrors the prerank gate's matching rule so a comment that survives here is
 * matched by the same definition prerank will use — "sre" must not hit inside
 * "stressed".
 */
export function termPresent(cleaned: string, term: string): boolean {
  const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === "") return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(cleaned);
}

// ============================================================
// Company lift
// ============================================================

/** Longest plausible company name from the first delimited segment. */
const MAX_COMPANY_CHARS = 60;

/** Most words a company name runs to before it is prose. */
const MAX_COMPANY_WORDS = 8;

/**
 * Lift the company name from a Who-is-Hiring comment's first `|`-delimited
 * segment. Returns null when the comment does not follow the convention.
 *
 * ── Why this is field mapping, not classification (operator ruling) ─────────
 * Classification is judgment about what content MEANS — deciding a posting is
 * a security role, inferring seniority, scoring relevance. Reading a documented
 * delimiter is field mapping. HN's thread publishes the format
 * `Company | Role | Location | ...` in its own posting instructions, so taking
 * the first segment is the same operation as Greenhouse's `content` →
 * description or Workday's `externalPath` → url. The delimiter is a schema,
 * just a weak one. Only the COMPANY is lifted: Phase 0c found the first
 * segment reliable while role/location genuinely vary in order and count, and
 * extracting those WOULD require judgment.
 *
 * ── Why it matters at all ───────────────────────────────────────────────────
 * Engine 1's fingerprint is sha1(company|role|url-host). Without a company,
 * every comment in a thread produces company="" role="" and the shared host
 * news.ycombinator.com — one identical fingerprint for the whole thread.
 * Live-caught 2026-07-28: 150 of 151 prefiltered comments deduped away.
 *
 * Note two postings from the SAME company in one thread still share a
 * fingerprint. That is correct dedupe behaviour, not a miss.
 *
 * The guard is deliberately conservative — a wrong company name is worse than
 * no company name, because it silently splits or merges the wrong records.
 * A rejection is not silent: sources/hn-hiring.ts reports the lift ratio.
 *
 * @param decoded output of {@link decodeCommentText} — case-PRESERVING. Do not
 *        pass the prefilter's `cleaned`, which is lowercased for matching; a
 *        company name must keep its capitalisation.
 */
export function liftCompany(decoded: string): string | null {
  const pipe = decoded.indexOf("|");
  if (pipe === -1) return null;

  const segment = decoded.slice(0, pipe).trim();
  if (segment === "") return null;
  if (segment.length > MAX_COMPANY_CHARS) return null;
  if (segment.split(/\s+/).length > MAX_COMPANY_WORDS) return null;
  // An internal sentence break means we are reading prose, not a field. A
  // TRAILING period is fine — "Acme Inc." is a company name.
  if (/[.!?]\s/.test(segment)) return null;

  return segment;
}

export interface PrefilterInput {
  /** Raw comment HTML, as returned by the Algolia items endpoint. */
  text: string;
  id: number | string;
}

export interface PrefilterHit<T extends PrefilterInput> {
  comment: T;
  /** Cleaned, lowercased text — reused by the caller so it is decoded once. */
  cleaned: string;
  /** Which scope terms matched, in the order the terms were given. */
  matched: string[];
}

export interface PrefilterResult<T extends PrefilterInput> {
  passed: PrefilterHit<T>[];
  /** Ids of every comment filtered out. Reported, never silently dropped. */
  rejected: Array<number | string>;
}

/**
 * Keep only the comments whose raw text mentions at least one scope term.
 *
 * Deliberately does NOT also require a remote marker: 150 of 276 comments in
 * the measured thread mention "remote", but HN's conventions are loose enough
 * that a genuinely remote posting can omit the word. The remote decision
 * belongs to prerank's location gate, which is conservative by design
 * (ambiguous passes). This filter answers one question only — "is this comment
 * about anything in the operator's scope at all?"
 *
 * @param comments thread children, in thread order.
 * @param terms    scope terms from {@link deriveQueryTerms}.
 */
export function prefilterComments<T extends PrefilterInput>(comments: T[], terms: string[]): PrefilterResult<T> {
  const passed: PrefilterHit<T>[] = [];
  const rejected: Array<number | string> = [];

  for (const comment of comments) {
    const cleaned = decodeCommentText(comment.text).toLowerCase();
    const matched = terms.filter((term) => termPresent(cleaned, term));
    if (matched.length > 0) passed.push({ comment, cleaned, matched });
    else rejected.push(comment.id);
  }

  return { passed, rejected };
}
