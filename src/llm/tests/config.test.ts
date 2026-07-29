// config.test.ts
// File: src/llm/tests/config.test.ts
// Purpose: Env resolution for the throttle — including the deliberate choice to
//          warn-and-default rather than throw on a malformed value.

import { describe, expect, it } from "vitest";
import { resolveThrottleConfig, THROTTLE_DEFAULTS, THROTTLE_ENV } from "../config";

const noWarn = () => undefined;

describe("resolveThrottleConfig", () => {
  it("uses the documented defaults when nothing is set", () => {
    expect(resolveThrottleConfig({}, noWarn)).toEqual(THROTTLE_DEFAULTS);
  });

  it("defaults RPM to 12 — under the operator-recorded free-tier 15", () => {
    expect(THROTTLE_DEFAULTS.maxRpm).toBe(12);
  });

  it("reads every tunable from its env var", () => {
    const config = resolveThrottleConfig(
      {
        [THROTTLE_ENV.maxRpm]: "5",
        [THROTTLE_ENV.maxAttempts]: "7",
        [THROTTLE_ENV.retryBudgetMs]: "1000",
        [THROTTLE_ENV.backoffBaseMs]: "250",
        [THROTTLE_ENV.backoffMaxMs]: "9000",
      },
      noWarn
    );
    expect(config).toEqual({
      maxRpm: 5,
      maxAttempts: 7,
      retryBudgetMs: 1000,
      backoffBaseMs: 250,
      backoffMaxMs: 9000,
    });
  });

  it("warns and falls back on a malformed value rather than throwing", () => {
    // Throwing here would surface inside an engine's catch → degrade path and
    // be reported as "the LLM failed" — an invisible misconfiguration, which is
    // the failure mode this whole change exists to remove.
    const warnings: string[] = [];
    const config = resolveThrottleConfig(
      { [THROTTLE_ENV.maxRpm]: "banana", [THROTTLE_ENV.maxAttempts]: "0" },
      (m) => warnings.push(m)
    );

    expect(config.maxRpm).toBe(THROTTLE_DEFAULTS.maxRpm);
    expect(config.maxAttempts).toBe(THROTTLE_DEFAULTS.maxAttempts);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("GEMINI_MAX_RPM");
  });

  it("treats an empty string as unset", () => {
    expect(resolveThrottleConfig({ [THROTTLE_ENV.maxRpm]: "  " }, noWarn).maxRpm).toBe(
      THROTTLE_DEFAULTS.maxRpm
    );
  });
});
