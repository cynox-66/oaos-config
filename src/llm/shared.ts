// shared.ts
// File: src/llm/shared.ts
// Purpose: The ONE process-wide throttle every real Gemini call passes through.
//
// WHY SHARED AND NOT PER-CLIENT: the requests-per-minute ceiling belongs to the
// API key, not to a client object. `score.ts` and `match.ts` each default-
// construct their own `createGeminiClient()` when no client is injected, so a
// per-instance limiter would let N clients each pace themselves to the full
// ceiling and multiply the real rate by N — reproducing the exact defect this
// module exists to fix. One key, one limiter.

import { createThrottle, realClock } from "./throttle";
import { resolveThrottleConfig } from "./config";
import { sharedStats } from "./stats";
import type { Throttle } from "./types";

let instance: Throttle | null = null;

/**
 * The process-wide throttle, created on first use so the environment is read
 * after any dotenv/CLI bootstrap has run.
 */
export function sharedThrottle(): Throttle {
  if (instance === null) {
    instance = createThrottle({
      config: resolveThrottleConfig(),
      clock: realClock,
      stats: sharedStats(),
    });
  }
  return instance;
}

/**
 * Parse a `Retry-After` header into milliseconds.
 *
 * Accepts both documented forms: delta-seconds and an HTTP date. Anything
 * unparseable or negative returns null, which puts the call back on plain
 * exponential backoff rather than on a guess.
 */
export function parseRetryAfterMs(header: string | null, nowMs: number = Date.now()): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : null;

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  const delta = at - nowMs;
  return delta > 0 ? delta : null;
}
