// throttle.test.ts
// File: src/llm/tests/throttle.test.ts
// Purpose: The throttle's behavioural contract — pacing, 429 retry, the
//          unchanged failure shape for everything else, the hard wait ceiling,
//          and the accuracy of the run tally.
//
//          NO TEST HERE SLEEPS. Time is a fake clock; a "10 minute" pacing
//          assertion runs in microseconds.

import { describe, expect, it } from "vitest";
import { createThrottle } from "../throttle";
import { createStats } from "../stats";
import { HttpStatusError } from "../types";
import { fakeClock, flakyCall, noJitter, rateLimit, serverError, testConfig } from "./helpers";

function harness(configOver = {}) {
  const clock = fakeClock();
  const stats = createStats();
  const logs: string[] = [];
  const throttle = createThrottle({
    config: testConfig(configOver),
    clock,
    stats,
    random: noJitter,
    log: (m) => logs.push(m),
  });
  return { clock, stats, logs, throttle };
}

describe("throttle — pacing", () => {
  it("spaces N calls issued at once to respect the RPM ceiling", async () => {
    const { clock, throttle } = harness({ maxRpm: 12 }); // one call per 5s
    const startedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 5 }, () =>
        throttle(async () => {
          startedAt.push(clock.now());
          return "ok";
        })
      )
    );

    expect(startedAt).toEqual([0, 5_000, 10_000, 15_000, 20_000]);
  });

  it("never issues more than maxRpm requests inside any 60s window", async () => {
    const { clock, throttle } = harness({ maxRpm: 12 });
    const startedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 30 }, () =>
        throttle(async () => {
          startedAt.push(clock.now());
          return "ok";
        })
      )
    );

    for (const t of startedAt) {
      const inWindow = startedAt.filter((x) => x >= t && x < t + 60_000).length;
      expect(inWindow).toBeLessThanOrEqual(12);
    }
  });

  it("does not delay a call that arrives after the ceiling has gone idle", async () => {
    const { clock, throttle } = harness({ maxRpm: 12 });
    await throttle(async () => "first");

    // Simulate a long gap: nothing was issued for a while.
    await clock.sleep(30_000);
    const issuedAt = await throttle(async () => clock.now());

    expect(issuedAt).toBe(30_000); // no additional pacing wait
  });

  it("counts each RETRY attempt against the ceiling too", async () => {
    const { clock, throttle } = harness({ maxRpm: 12 });
    const call = flakyCall(1, rateLimit);
    const at: number[] = [];

    await throttle(async () => {
      at.push(clock.now());
      return call.fn();
    });

    // attempt 1 at t=0, backoff 2000*0.5 + 1*1000 = 2000, then the next slot is
    // 5000 (pacing), so the retry cannot be earlier than that.
    expect(at[0]).toBe(0);
    expect(at[1]).toBeGreaterThanOrEqual(5_000);
  });
});

describe("throttle — 429 retry", () => {
  it("429 → retry → success returns the result and logs it as a retry", async () => {
    const { stats, logs, throttle } = harness();
    const call = flakyCall(1, rateLimit, "recovered");

    await expect(throttle(call.fn)).resolves.toBe("recovered");

    expect(call.attempts()).toBe(2);
    expect(stats.succeededAfterRetry).toBe(1);
    expect(stats.failedPermanently).toBe(0);
    expect(logs.some((l) => l.includes("retrying (attempt 2/4)"))).toBe(true);
    // A retried-then-succeeded call must NOT read like a permanent failure.
    expect(logs.some((l) => l.includes("giving up"))).toBe(false);
  });

  it("backs off exponentially between attempts", async () => {
    const { clock, throttle } = harness({ maxRpm: 60_000 }); // pacing out of the way
    const call = flakyCall(3, rateLimit);

    await throttle(call.fn);

    // equal jitter with random()=1 → the full computed delay: 2s, 4s, 8s.
    expect(clock.sleeps.filter((s) => s > 0)).toEqual([2_000, 4_000, 8_000]);
  });

  it("honors Retry-After, clamped to the per-attempt cap", async () => {
    const { clock, throttle } = harness({ maxRpm: 60_000, backoffMaxMs: 10_000 });
    const call = flakyCall(1, () => rateLimit(999_000));

    await throttle(call.fn);

    expect(clock.sleeps.filter((s) => s > 0)).toEqual([10_000]);
  });

  it("exhausts max attempts, then throws the original error unchanged", async () => {
    const { stats, logs, throttle } = harness({ maxAttempts: 4 });
    const call = flakyCall(Infinity, rateLimit);

    const err = await throttle(call.fn).catch((e) => e);

    expect(call.attempts()).toBe(4);
    expect(err).toBeInstanceOf(Error);
    // Shape-identical to what the client threw before this module existed.
    expect(err.message).toBe("Gemini request failed: HTTP 429");
    expect(String(err)).toBe("Error: Gemini request failed: HTTP 429");
    expect(stats.failedPermanently).toBe(1);
    expect(logs.some((l) => l.includes("giving up after 4 attempt(s)"))).toBe(true);
  });
});

describe("throttle — non-429 errors are untouched", () => {
  it("does not retry a 500 and rethrows it identically", async () => {
    const { stats, logs, throttle } = harness();
    const call = flakyCall(Infinity, serverError);

    const err = await throttle(call.fn).catch((e) => e);

    expect(call.attempts()).toBe(1); // no extra attempt
    expect(err).toBeInstanceOf(HttpStatusError);
    expect(err.message).toBe("Gemini request failed: HTTP 500");
    expect(logs).toEqual([]);
    expect(stats.rateLimited).toBe(0);
    expect(stats.failedPermanently).toBe(1);
  });

  it("does not retry a plain Error (e.g. an unparseable response)", async () => {
    const { throttle } = harness();
    const call = flakyCall(Infinity, () => new Error("Gemini response contained no text"));

    const err = await throttle(call.fn).catch((e) => e);

    expect(call.attempts()).toBe(1);
    expect(err.message).toBe("Gemini response contained no text");
  });
});

describe("throttle — total wait ceiling", () => {
  it("terminates a pathological all-429 sequence instead of hanging", async () => {
    // A large attempt count with a small budget: the budget must be what stops
    // it, not the attempts.
    const { clock, stats, logs, throttle } = harness({
      maxRpm: 60_000,
      maxAttempts: 1_000,
      retryBudgetMs: 10_000,
      backoffBaseMs: 2_000,
      backoffMaxMs: 30_000,
    });
    const call = flakyCall(Infinity, rateLimit);

    const err = await throttle(call.fn).catch((e) => e);

    expect(err.message).toBe("Gemini request failed: HTTP 429");
    expect(call.attempts()).toBeLessThan(10);
    expect(stats.backoffWaitMs).toBeLessThanOrEqual(10_000);
    expect(clock.current()).toBeLessThanOrEqual(10_000);
    expect(logs.some((l) => l.includes("retry budget of 10000ms exhausted"))).toBe(true);
  });
});

describe("throttle — counters", () => {
  it("tallies a mixed sequence accurately", async () => {
    const { stats, throttle } = harness({ maxRpm: 60_000 });

    await throttle(async () => "clean"); // 1: straight through
    await throttle(flakyCall(2, rateLimit).fn); // 2: 429 x2 then success
    await throttle(flakyCall(Infinity, rateLimit).fn).catch(() => undefined); // 3: permanent 429
    await throttle(flakyCall(Infinity, serverError).fn).catch(() => undefined); // 4: 500
    await throttle(async () => "clean"); // 5: straight through

    expect(stats).toMatchObject({
      total: 5,
      rateLimited: 2, // calls that saw >=1 429, not individual 429 responses
      succeededAfterRetry: 1,
      failedPermanently: 2, // the exhausted 429 and the 500
    });
  });

  it("does not count a call as rate-limited more than once", async () => {
    const { stats, throttle } = harness({ maxRpm: 60_000 });
    await throttle(flakyCall(3, rateLimit).fn);
    expect(stats.rateLimited).toBe(1);
    expect(stats.succeededAfterRetry).toBe(1);
  });
});
