// helpers.ts
// File: src/llm/tests/helpers.ts
// Purpose: Fakes shared by the throttle tests. Nothing here sleeps or touches
//          the network — virtual time only.

import type { Clock, ThrottleConfig } from "../types";
import { HttpStatusError } from "../types";

/**
 * A clock whose `sleep` advances a virtual timestamp synchronously. Tests that
 * exercise multi-minute pacing therefore run in microseconds.
 */
export interface FakeClock extends Clock {
  /** Every duration passed to sleep(), in order. */
  readonly sleeps: number[];
  /** Current virtual time. */
  current(): number;
}

/**
 * Virtual time with a real scheduler.
 *
 * `sleep` registers a deadline and returns; a pump running on zero-delay
 * macrotasks resolves the EARLIEST pending deadline and jumps `now` to it. That
 * ordering is what makes concurrent waiters observe distinct times — a naive
 * "advance t by ms on every sleep" clock lets five parallel callers all wake at
 * the last one's deadline, which would hide exactly the pacing bug these tests
 * are here to catch. The macrotasks are 0ms: simulated hours cost real
 * microseconds.
 */
export function fakeClock(start = 0): FakeClock {
  let t = start;
  const sleeps: number[] = [];
  const timers: { at: number; resolve: () => void }[] = [];
  let pumpQueued = false;

  function queuePump(): void {
    if (pumpQueued) return;
    pumpQueued = true;
    setTimeout(pump, 0);
  }

  function pump(): void {
    pumpQueued = false;
    if (timers.length === 0) return;
    timers.sort((a, b) => a.at - b.at);
    const next = timers.shift()!;
    t = Math.max(t, next.at);
    next.resolve();
    queuePump(); // keep draining while any waiter remains
  }

  return {
    now: () => t,
    sleep(ms: number) {
      sleeps.push(ms);
      if (ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        timers.push({ at: t + ms, resolve });
        queuePump();
      });
    },
    sleeps,
    current: () => t,
  };
}

export const testConfig = (over: Partial<ThrottleConfig> = {}): ThrottleConfig => ({
  maxRpm: 12,
  maxAttempts: 4,
  retryBudgetMs: 60_000,
  backoffBaseMs: 2_000,
  backoffMaxMs: 30_000,
  ...over,
});

/** Deterministic jitter: always the midpoint of the equal-jitter range. */
export const noJitter = () => 1;

export const rateLimit = (retryAfterMs: number | null = null): HttpStatusError =>
  new HttpStatusError("Gemini request failed: HTTP 429", 429, retryAfterMs);

export const serverError = (): HttpStatusError =>
  new HttpStatusError("Gemini request failed: HTTP 500", 500);

/**
 * A call that fails with `error` the first `failures` times, then resolves.
 * Records how many attempts it saw.
 */
export function flakyCall(failures: number, error: () => Error, value = "ok") {
  let attempts = 0;
  return {
    attempts: () => attempts,
    fn: async () => {
      attempts += 1;
      if (attempts <= failures) throw error();
      return value;
    },
  };
}
