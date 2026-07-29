// config.ts
// File: src/llm/config.ts
// Purpose: Throttle defaults and env resolution, in one place.

import type { ThrottleConfig } from "./types";

/**
 * Defaults.
 *
 * RPM: the Gemini free tier on the OAOS-v2 project was recorded at 15 RPM /
 * 500 RPD per model (operator's reading of the AI Studio rate-limit dashboard;
 * see CLAUDE.md). That figure was NOT re-verified when this throttle was
 * written. 12 leaves ~20% headroom under it, which matters because the server's
 * minute is a sliding window that our fixed spacing cannot align with — pacing
 * at exactly the ceiling would still produce boundary 429s.
 *
 * Attempts/backoff: 4 attempts = 1 try + 3 retries at ~2s/4s/8s (equal jitter),
 * which covers a transient burst without turning one bad call into a long stall.
 * retryBudgetMs is a HARD ceiling on one call's total backoff, applied even when
 * attempts remain — that is what stops a pathological all-429 run from hanging.
 */
export const THROTTLE_DEFAULTS: ThrottleConfig = {
  maxRpm: 12,
  maxAttempts: 4,
  retryBudgetMs: 60_000,
  backoffBaseMs: 2_000,
  backoffMaxMs: 30_000,
};

/** Env var names, exported so the README and tests can't drift from the code. */
export const THROTTLE_ENV = {
  maxRpm: "GEMINI_MAX_RPM",
  maxAttempts: "GEMINI_MAX_ATTEMPTS",
  retryBudgetMs: "GEMINI_RETRY_BUDGET_MS",
  backoffBaseMs: "GEMINI_BACKOFF_BASE_MS",
  backoffMaxMs: "GEMINI_BACKOFF_MAX_MS",
} as const;

/**
 * A malformed value WARNS and falls back to the default rather than throwing.
 * Deliberate: every caller of this module sits inside an engine's `catch` →
 * degrade path, so a thrown config error would be swallowed and re-reported as
 * "the LLM failed" — the exact class of invisible failure this whole change
 * exists to remove. A loud warning plus a known-good default is honest.
 */
function readPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  warn: (m: string) => void
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    warn(`[gemini] ${name}="${raw}" is not a positive number — using ${fallback}`);
    return fallback;
  }
  return value;
}

/** Resolve the throttle config from the environment. */
export function resolveThrottleConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (m: string) => void = console.warn
): ThrottleConfig {
  return {
    maxRpm: readPositiveInt(env, THROTTLE_ENV.maxRpm, THROTTLE_DEFAULTS.maxRpm, warn),
    maxAttempts: readPositiveInt(
      env,
      THROTTLE_ENV.maxAttempts,
      THROTTLE_DEFAULTS.maxAttempts,
      warn
    ),
    retryBudgetMs: readPositiveInt(
      env,
      THROTTLE_ENV.retryBudgetMs,
      THROTTLE_DEFAULTS.retryBudgetMs,
      warn
    ),
    backoffBaseMs: readPositiveInt(
      env,
      THROTTLE_ENV.backoffBaseMs,
      THROTTLE_DEFAULTS.backoffBaseMs,
      warn
    ),
    backoffMaxMs: readPositiveInt(
      env,
      THROTTLE_ENV.backoffMaxMs,
      THROTTLE_DEFAULTS.backoffMaxMs,
      warn
    ),
  };
}
