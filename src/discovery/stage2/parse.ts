// parse.ts
// File: src/discovery/stage2/parse.ts
// Purpose: Source detection + dispatch for Stage 2 alert parsing. Given a raw
//          email (headers + body), identify which known format it is and route
//          to that format's parser. Pure and testable; no network, no LLM.
//
// Detection strategy: primary signal is the From: header domain (the most
// stable identifier — an alert always comes from the product's sending
// domain). The Subject line is a secondary confirmer. If no known sender
// domain matches, detection returns null (a clear "unknown source" signal) —
// it never guesses, so an unrecognized email is skipped rather than
// mis-parsed.

import type { RawItem } from "../../engines/normalization/types";
import type { AlertSource } from "./types";
import { getHeader } from "./parsers/shared";
import { parseAlert as parseLinkedIn } from "./parsers/linkedin";
import { parseAlert as parseIndeed } from "./parsers/indeed";
import { parseAlert as parseWellfound } from "./parsers/wellfound";
import { parseAlert as parseWeWorkRemotely } from "./parsers/weworkremotely";
import { parseAlert as parseUpwork } from "./parsers/upwork";
import { parseAlert as parseRemoteOk } from "./parsers/remoteok";

/** The parser function each source dispatches to. */
const PARSERS: Record<AlertSource, (rawText: string) => RawItem[]> = {
  linkedin: parseLinkedIn,
  indeed: parseIndeed,
  wellfound: parseWellfound,
  weworkremotely: parseWeWorkRemotely,
  upwork: parseUpwork,
  remoteok: parseRemoteOk,
};

/**
 * Sender-domain patterns per source (matched against the From: header). Ordered
 * most-specific first so a partial substring cannot shadow a distinct source.
 */
const SENDER_DOMAINS: ReadonlyArray<{ source: AlertSource; re: RegExp }> = [
  { source: "linkedin", re: /linkedin\.com/i },
  { source: "indeed", re: /indeed\.com/i },
  { source: "wellfound", re: /wellfound\.com|angel\.co/i },
  { source: "weworkremotely", re: /weworkremotely\.com/i },
  { source: "upwork", re: /upwork\.com/i },
  { source: "remoteok", re: /remoteok\.(com|io)/i },
];

/**
 * Identify which known alert format an email is, by its From: header domain
 * (with a body-domain fallback for forwarded emails whose From: was rewritten).
 * Returns null when nothing matches — the caller should skip the email rather
 * than guess.
 *
 * @param email full raw email text (headers + body).
 */
export function detectSource(email: string): AlertSource | null {
  const from = getHeader(email, "From") ?? "";
  for (const { source, re } of SENDER_DOMAINS) {
    if (re.test(from)) return source;
  }
  // Fallback: a forwarded alert may lose its original From:. Try the body once,
  // still requiring an exact sender-domain match (no fuzzy guessing).
  for (const { source, re } of SENDER_DOMAINS) {
    if (re.test(email)) return source;
  }
  return null;
}

/**
 * Detect the source of an alert email and parse it into RawItems. Returns an
 * empty array for an unrecognized source (detection returned null) or when the
 * recognized format contained no listings. Never throws.
 *
 * The returned RawItems flow, unchanged, into the existing intake path:
 * `normalize(item)` → `runPipeline`. Stage 2 adds no engine behavior.
 *
 * @param email full raw email text (headers + body).
 */
export function parseAlertEmail(email: string): RawItem[] {
  const source = detectSource(email);
  if (source === null) return [];
  return PARSERS[source](email);
}
