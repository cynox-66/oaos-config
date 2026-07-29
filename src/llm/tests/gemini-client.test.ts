// gemini-client.test.ts
// File: src/llm/tests/gemini-client.test.ts
// Purpose: The throttled Gemini client end-to-end against a FAKE fetch — no
//          network, ever — plus the assertion that matters most: after retries
//          are exhausted, a real engine's degradation path still triggers
//          exactly as it did before the throttle existed.

import { describe, expect, it } from "vitest";
import { createGeminiClient } from "../../engines/scoring/gemini";
import { computeScore } from "../../engines/scoring/score";
import { createThrottle } from "../throttle";
import { createStats } from "../stats";
import { parseRetryAfterMs } from "../shared";
import { fakeClock, noJitter, testConfig } from "./helpers";
import { FIXED_NOW, makeRequest } from "../../engines/scoring/tests/helpers";

// ============================================================
// Fake HTTP
// ============================================================

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that replays a scripted sequence of replies. */
function fakeFetch(replies: Reply[]) {
  let i = 0;
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      headers: { get: (h: string) => reply.headers?.[h.toLowerCase()] ?? null },
      json: async () => reply.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { impl, calls, count: () => i };
}

const textReply = (text: string): Reply => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text }] } }] },
});

function client(replies: Reply[], configOver = {}) {
  const stats = createStats();
  const logs: string[] = [];
  const http = fakeFetch(replies);
  const throttle = createThrottle({
    config: testConfig({ maxRpm: 60_000, ...configOver }),
    clock: fakeClock(),
    stats,
    random: noJitter,
    log: (m) => logs.push(m),
  });
  return {
    stats,
    logs,
    http,
    gemini: createGeminiClient("test-key", { fetchImpl: http.impl, throttle }),
  };
}

// ============================================================
// Tests
// ============================================================

describe("gemini client — throttled", () => {
  it("returns the text on a clean 200", async () => {
    const { gemini, stats, http } = client([textReply('{"ok":true}')]);
    await expect(gemini.generate("p")).resolves.toBe('{"ok":true}');
    expect(http.count()).toBe(1);
    expect(stats).toMatchObject({ total: 1, rateLimited: 0, failedPermanently: 0 });
  });

  it("retries a 429 and returns the eventual success", async () => {
    const { gemini, stats, logs, http } = client([
      { status: 429 },
      { status: 429 },
      textReply('{"ok":true}'),
    ]);

    await expect(gemini.generate("p")).resolves.toBe('{"ok":true}');
    expect(http.count()).toBe(3);
    expect(stats).toMatchObject({ rateLimited: 1, succeededAfterRetry: 1, failedPermanently: 0 });
    expect(logs.filter((l) => l.includes("retrying")).length).toBe(2);
  });

  it("reads Retry-After off the 429 response", async () => {
    const { gemini, logs } = client([{ status: 429, headers: { "retry-after": "7" } }, textReply("x")]);
    await gemini.generate("p");
    expect(logs[0]).toContain("in 7.0s");
  });

  it("throws the pre-throttle error message when retries are exhausted", async () => {
    const { gemini, http } = client([{ status: 429 }], { maxAttempts: 3 });

    const err = await gemini.generate("p").catch((e) => e);

    expect(http.count()).toBe(3);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Gemini request failed: HTTP 429");
    expect(String(err)).toBe("Error: Gemini request failed: HTTP 429");
  });

  it("does not retry a non-429 HTTP error", async () => {
    const { gemini, http, stats } = client([{ status: 500 }]);

    const err = await gemini.generate("p").catch((e) => e);

    expect(http.count()).toBe(1);
    expect(err.message).toBe("Gemini request failed: HTTP 500");
    expect(stats).toMatchObject({ rateLimited: 0, failedPermanently: 1 });
  });

  it("does not retry a 200 whose body carries no text", async () => {
    const { gemini, http } = client([{ status: 200, body: { candidates: [] } }]);

    const err = await gemini.generate("p").catch((e) => e);

    expect(http.count()).toBe(1);
    expect(err.message).toBe("Gemini response contained no text");
  });

  it("refuses a missing API key before spending a slot or a stats entry", async () => {
    const stats = createStats();
    const http = fakeFetch([textReply("x")]);
    const throttle = createThrottle({
      config: testConfig(),
      clock: fakeClock(),
      stats,
      random: noJitter,
      log: () => undefined,
    });
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const gemini = createGeminiClient(undefined, { fetchImpl: http.impl, throttle });
      await expect(gemini.generate("p")).rejects.toThrow("GEMINI_API_KEY is not set");
      expect(http.count()).toBe(0);
      expect(stats.total).toBe(0);
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  });
});

// ============================================================
// The failure shape callers depend on
// ============================================================

describe("exhausted retries leave the engine degradation path intact", () => {
  it("scoring falls back to rule-pass with a capped confidence, exactly as before", async () => {
    // Every attempt 429s — the worst case from the live run that exposed this.
    const { gemini } = client([{ status: 429 }], { maxAttempts: 2 });

    const score = await computeScore(makeRequest(), {
      client: gemini,
      now: FIXED_NOW,
    });

    // The engine degraded rather than throwing: a score still came back,
    // computed from the deterministic rule pass, with confidence capped.
    expect(score).toBeTruthy();
    expect(score.confidence).toBeLessThanOrEqual(0.4);
    expect(typeof score.total).toBe("number");
  });
});

// ============================================================
// Retry-After parsing
// ============================================================

describe("parseRetryAfterMs", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfterMs("30")).toBe(30_000);
  });

  it("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-07-29T00:00:00.000Z");
    expect(parseRetryAfterMs("Wed, 29 Jul 2026 00:00:20 GMT", now)).toBe(20_000);
  });

  it("returns null for a missing, empty, negative, or unparseable value", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("  ")).toBeNull();
    expect(parseRetryAfterMs("-5")).toBeNull();
    expect(parseRetryAfterMs("soon")).toBeNull();
  });

  it("returns null for a date already in the past", () => {
    const now = Date.parse("2026-07-29T00:01:00.000Z");
    expect(parseRetryAfterMs("Wed, 29 Jul 2026 00:00:00 GMT", now)).toBeNull();
  });
});
