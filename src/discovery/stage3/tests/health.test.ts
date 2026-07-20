// health.test.ts
// File: src/discovery/stage3/tests/health.test.ts

import { describe, expect, it } from "vitest";
import { advanceHealth, createHealthState } from "../health";
import type { HealthCheckResult, SourceHealthState } from "../types";

const now = () => "2026-07-20T00:00:00.000Z";
const ok: HealthCheckResult = { ok: true, checkedAt: now(), detail: "ok" };
const fail: HealthCheckResult = { ok: false, checkedAt: now(), detail: "fail" };

describe("createHealthState", () => {
  it("starts healthy with zero failures and no recovery flag", () => {
    expect(createHealthState("greenhouse")).toEqual({
      source: "greenhouse",
      consecutiveFailures: 0,
      status: "healthy",
      lastResult: null,
      recoveredFromDisabled: false,
    });
  });
});

describe("advanceHealth — exhaustive transition table", () => {
  const state = (overrides: Partial<SourceHealthState>): SourceHealthState => ({
    source: "s",
    consecutiveFailures: 0,
    status: "healthy",
    lastResult: null,
    recoveredFromDisabled: false,
    ...overrides,
  });

  it("row 1: healthy(0) + success -> healthy(0), flag false", () => {
    const next = advanceHealth(state({ status: "healthy", consecutiveFailures: 0 }), ok);
    expect(next).toMatchObject({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: false });
  });

  it("row 2: healthy(0) + failure -> probation(1), flag false", () => {
    const next = advanceHealth(state({ status: "healthy", consecutiveFailures: 0 }), fail);
    expect(next).toMatchObject({ status: "probation", consecutiveFailures: 1, recoveredFromDisabled: false });
  });

  it("row 3: probation(1) + success -> healthy(0), flag false", () => {
    const next = advanceHealth(state({ status: "probation", consecutiveFailures: 1 }), ok);
    expect(next).toMatchObject({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: false });
  });

  it("row 4: probation(1) + failure -> auto_disabled(2), flag false", () => {
    const next = advanceHealth(state({ status: "probation", consecutiveFailures: 1 }), fail);
    expect(next).toMatchObject({ status: "auto_disabled", consecutiveFailures: 2, recoveredFromDisabled: false });
  });

  it("row 5: auto_disabled(2) + failure -> auto_disabled(2) capped, flag false", () => {
    const next = advanceHealth(state({ status: "auto_disabled", consecutiveFailures: 2 }), fail);
    expect(next).toMatchObject({ status: "auto_disabled", consecutiveFailures: 2, recoveredFromDisabled: false });
  });

  it("row 6: auto_disabled(2) + success -> healthy(0), flag TRUE (recovery)", () => {
    const next = advanceHealth(state({ status: "auto_disabled", consecutiveFailures: 2 }), ok);
    expect(next).toMatchObject({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: true });
  });

  it("row 7: healthy(0, flag=true) + success -> healthy(0), flag cleared", () => {
    const recovered = state({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: true });
    const next = advanceHealth(recovered, ok);
    expect(next).toMatchObject({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: false });
  });

  it("row 8: healthy(0, flag=true) + failure -> probation(1), flag cleared", () => {
    const recovered = state({ status: "healthy", consecutiveFailures: 0, recoveredFromDisabled: true });
    const next = advanceHealth(recovered, fail);
    expect(next).toMatchObject({ status: "probation", consecutiveFailures: 1, recoveredFromDisabled: false });
  });

  it("preserves source and carries lastResult forward", () => {
    const next = advanceHealth(state({ source: "lever" }), fail);
    expect(next.source).toBe("lever");
    expect(next.lastResult).toEqual(fail);
  });

  it("is deterministic: same input produces byte-identical output", () => {
    const s = state({ status: "probation", consecutiveFailures: 1 });
    expect(advanceHealth(s, fail)).toEqual(advanceHealth(s, fail));
  });
});
