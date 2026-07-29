// types.ts
// File: src/llm/types.ts
// Purpose: Types for the shared LLM call throttle. This module knows nothing
//          about Gemini's payload shape or about any engine — it works over a
//          bare `() => Promise<T>` so the only thing it can affect is WHEN a
//          call is issued and HOW a 429 is retried.

/**
 * Injectable clock. Production uses `Date.now` + `setTimeout`; tests pass a
 * fake that advances a virtual timestamp synchronously, so the suite never
 * actually sleeps.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Tunables for the throttle. Resolved from env once, see config.ts. */
export interface ThrottleConfig {
  /** Requests-per-minute ceiling. Spacing between attempts is 60000/maxRpm. */
  maxRpm: number;
  /** Total attempts per call, including the first (so 4 = 1 try + 3 retries). */
  maxAttempts: number;
  /** Hard ceiling on total backoff wait for ONE call, independent of attempts. */
  retryBudgetMs: number;
  /** First backoff delay; doubles per retry. */
  backoffBaseMs: number;
  /** Per-attempt backoff cap, also the clamp applied to a `Retry-After` header. */
  backoffMaxMs: number;
}

/**
 * Run-level tally. `rateLimited` counts CALLS that saw at least one 429, not
 * individual 429 responses — the operator-facing question is "how many of my
 * opportunities hit the ceiling", not "how many packets bounced".
 */
export interface LlmCallStats {
  /** Calls entering the throttle (excludes calls rejected before any attempt). */
  total: number;
  /** Calls that saw >= 1 HTTP 429. */
  rateLimited: number;
  /** Calls that saw >= 1 HTTP 429 and then returned a result. */
  succeededAfterRetry: number;
  /** Calls that ultimately threw — 429-exhausted or any other error. */
  failedPermanently: number;
  /** Milliseconds spent waiting for a throttle slot (pacing, not backoff). */
  throttleWaitMs: number;
  /** Milliseconds spent in 429 backoff sleeps. */
  backoffWaitMs: number;
}

/**
 * An HTTP-status-carrying error. The message is byte-identical to what the
 * Gemini client threw before this module existed, so every engine's existing
 * `catch` → degrade path sees exactly what it saw yesterday. `status` is an
 * additive property used only for retry classification inside this module.
 */
export class HttpStatusError extends Error {
  readonly status: number;
  /** Server-supplied `Retry-After`, in ms, when present and parseable. */
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "Error";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Deps for {@link createThrottle}. Everything effectful is injected. */
export interface ThrottleDeps {
  config: ThrottleConfig;
  clock: Clock;
  stats: LlmCallStats;
  /** Jitter source; injected so backoff is deterministic under test. */
  random?: () => number;
  /** Retry notices. Defaults to console.warn; tests capture it. */
  log?: (message: string) => void;
}

/** The wrapper returned by {@link createThrottle}. */
export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;
