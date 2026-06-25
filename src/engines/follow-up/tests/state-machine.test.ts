// tests/state-machine.test.ts
// Pure state machine: due dates, terminal conditions, hard cap, OSS suppression.

import { describe, it, expect } from "vitest";
import { computeNextStep } from "../state-machine";
import { SENT_DATE, MS_PER_DAY, makeRequest, makeOpportunity } from "./helpers";

const NOW = new Date("2026-06-10T00:00:00.000Z");
const run = (over: Parameters<typeof makeRequest>[0]) => computeNextStep(makeRequest(over), NOW);

describe("due dates (exact)", () => {
  it("step 0 → FU1 due = sent_date + 4 days, output step 1", () => {
    const s = run({ step: 0 });
    expect(s.terminal).toBe(false);
    expect(s.step).toBe(1);
    expect(s.next_due?.getTime()).toBe(SENT_DATE.getTime() + 4 * MS_PER_DAY);
  });

  it("step 1 → FU2 due = sent_date + 10 days, output step 2", () => {
    const s = run({ step: 1 });
    expect(s.step).toBe(2);
    expect(s.next_due?.getTime()).toBe(SENT_DATE.getTime() + 10 * MS_PER_DAY);
  });

  it("step 2 → FU3 due = sent_date + 17 days, output step 3", () => {
    const s = run({ step: 2 });
    expect(s.step).toBe(3);
    expect(s.next_due?.getTime()).toBe(SENT_DATE.getTime() + 17 * MS_PER_DAY);
  });
});

describe("terminal conditions", () => {
  it("step 3 sent, no reply → terminal No_Response", () => {
    const s = run({ step: 3 });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("no_response");
    expect(s.next_due).toBeNull();
    expect(s.draft).toBeNull();
  });

  it("Replied at step 0 → terminal immediately", () => {
    const s = run({ step: 0, status: "Replied" });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("replied");
  });

  it("Replied at step 2 → terminal immediately", () => {
    const s = run({ step: 2, status: "Replied" });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("replied");
  });

  it("Bounced → terminal, reason bounced", () => {
    const s = run({ step: 1, status: "Bounced" });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("bounced");
  });

  it("Cancelled → terminal, reason cancelled", () => {
    const s = run({ step: 1, status: "Cancelled" });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("cancelled");
  });

  it("No_Response status → terminal, reason no_response", () => {
    const s = run({ step: 1, status: "No_Response" });
    expect(s.terminal).toBe(true);
    expect(s.terminal_reason).toBe("no_response");
  });
});

describe("hard cap (step never > 3)", () => {
  it("no scheduling step produces step > 3", () => {
    for (const step of [0, 1, 2, 3]) {
      const s = run({ step });
      expect(s.step).toBeLessThanOrEqual(3);
    }
  });
});

describe("OSS suppression", () => {
  it("OSS + step >= 1 → terminal oss_suppressed, no draft, no due date", () => {
    for (const step of [1, 2]) {
      const s = run({ step, opportunity: makeOpportunity("OSS") });
      expect(s.terminal).toBe(true);
      expect(s.terminal_reason).toBe("oss_suppressed");
      expect(s.next_due).toBeNull();
      expect(s.draft).toBeNull();
    }
  });

  it("OSS + step 0 → FU1 still scheduled (pre-application engagement)", () => {
    const s = run({ step: 0, opportunity: makeOpportunity("OSS") });
    expect(s.terminal).toBe(false);
    expect(s.step).toBe(1);
  });
});
