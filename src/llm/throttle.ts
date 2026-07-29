// throttle.ts
// File: src/llm/throttle.ts
// Purpose: Rate-limit and 429-retry every outgoing LLM call.
//
// WHY THIS EXISTS: the free tier limits requests per MINUTE, not just per day.
// The prerank gate protects the daily budget; nothing protected the per-minute
// rate. Stage-3 discovery emits ~4-7 Gemini calls per opportunity as fast as
// the pipeline can produce them, so the first real activated run 429'd on a
// large fraction of its calls and wrote 14 of 25 opportunities with defaulted
// scores and zero opportunity-specific evidence reasoning. Manual Stage-1
// intake never hit this because it feeds one opportunity at a time.
//
// FAILURE SHAPE IS UNCHANGED BY DESIGN. When retries are exhausted this
// rethrows the ORIGINAL error, so every engine's existing catch → degrade path
// behaves exactly as it did before. This module makes failures rarer and
// visible; it never makes them look different.

import type { LlmCallStats, Throttle, ThrottleDeps } from "./types";
import { HttpStatusError } from "./types";

/** Real clock. The only place in this module that touches wall time. */
export const realClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** 429 is the ONLY status that triggers the retry path. */
function isRateLimited(err: unknown): err is HttpStatusError {
  return err instanceof HttpStatusError && err.status === 429;
}

/**
 * Equal jitter: half the computed delay is fixed, half is random. Keeps a
 * guaranteed minimum spacing (unlike full jitter, which can retry almost
 * immediately) while still de-correlating concurrent retries.
 */
function backoffFor(
  attempt: number,
  err: HttpStatusError,
  config: ThrottleDeps["config"],
  random: () => number
): number {
  if (err.retryAfterMs !== null) {
    // Server told us how long to wait. Honor it, but never past the cap — an
    // absurd Retry-After must not become an unbounded stall.
    return Math.min(err.retryAfterMs, config.backoffMaxMs);
  }
  const raw = Math.min(config.backoffBaseMs * 2 ** (attempt - 1), config.backoffMaxMs);
  return Math.round(raw / 2 + random() * (raw / 2));
}

/**
 * Create a throttle: a wrapper that paces calls to a requests-per-minute
 * ceiling and retries 429s with exponential backoff.
 *
 * Pacing is enforced by a monotonically advancing reservation (`nextSlotAt`).
 * The reservation is taken SYNCHRONOUSLY before any await, so concurrent
 * callers each get a distinct slot and no two can interleave onto the same one.
 * Each ATTEMPT takes a slot — a retry is a request too.
 */
export function createThrottle(deps: ThrottleDeps): Throttle {
  const { config, clock, stats } = deps;
  const random = deps.random ?? Math.random;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const intervalMs = 60_000 / config.maxRpm;

  let nextSlotAt = 0;

  async function acquireSlot(): Promise<void> {
    const now = clock.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + intervalMs; // reserved before any await — see above
    const wait = slot - now;
    if (wait > 0) {
      stats.throttleWaitMs += wait;
      await clock.sleep(wait);
    }
  }

  return async function throttled<T>(fn: () => Promise<T>): Promise<T> {
    stats.total += 1;
    let sawRateLimit = false;
    let backoffSpent = 0;

    for (let attempt = 1; ; attempt += 1) {
      await acquireSlot();

      try {
        const result = await fn();
        if (sawRateLimit) stats.succeededAfterRetry += 1;
        return result;
      } catch (err) {
        // Non-429 errors keep their existing behavior exactly: thrown on the
        // first attempt, never retried.
        if (!isRateLimited(err)) {
          stats.failedPermanently += 1;
          throw err;
        }

        if (!sawRateLimit) {
          sawRateLimit = true;
          stats.rateLimited += 1;
        }

        if (attempt >= config.maxAttempts) {
          stats.failedPermanently += 1;
          log(
            `[gemini] HTTP 429 — giving up after ${attempt} attempt(s); ` +
              `the caller's degradation path takes over`
          );
          throw err;
        }

        const wait = backoffFor(attempt, err, config, random);
        if (backoffSpent + wait > config.retryBudgetMs) {
          // Hard ceiling, independent of attempts remaining. This is what stops
          // a pathological all-429 sequence from hanging a run.
          stats.failedPermanently += 1;
          log(
            `[gemini] HTTP 429 — retry budget of ${config.retryBudgetMs}ms exhausted ` +
              `after ${attempt} attempt(s); the caller's degradation path takes over`
          );
          throw err;
        }

        log(
          `[gemini] HTTP 429 — retrying (attempt ${attempt + 1}/${config.maxAttempts}) ` +
            `in ${(wait / 1000).toFixed(1)}s`
        );
        backoffSpent += wait;
        stats.backoffWaitMs += wait;
        await clock.sleep(wait);
      }
    }
  };
}

/** Re-exported for convenience at the call site. */
export type { LlmCallStats };
