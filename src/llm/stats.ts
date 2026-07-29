// stats.ts
// File: src/llm/stats.ts
// Purpose: The run-level LLM call tally.

import type { LlmCallStats } from "./types";

/** A zeroed tally. */
export function createStats(): LlmCallStats {
  return {
    total: 0,
    rateLimited: 0,
    succeededAfterRetry: 0,
    failedPermanently: 0,
    throttleWaitMs: 0,
    backoffWaitMs: 0,
  };
}

/**
 * The process-wide tally the real Gemini client writes to.
 *
 * Shared, like the throttle itself, because the quota is a property of the API
 * key — not of any one client instance.
 */
const shared: LlmCallStats = createStats();

/** Live reference to the shared tally (used internally to wire the throttle). */
export function sharedStats(): LlmCallStats {
  return shared;
}

/** Snapshot of the shared tally — a copy, so a caller can't mutate the count. */
export function getGeminiCallStats(): LlmCallStats {
  return { ...shared };
}

/** Zero the shared tally. Intended for a run boundary or a test. */
export function resetGeminiCallStats(): void {
  Object.assign(shared, createStats());
}
