// prerank.test.ts
// File: src/discovery/prerank/tests/prerank.test.ts
// Purpose: Fixture-based unit tests for the Prerank Gate. Hand-built RawItem
//          batches only — no live data, no network, no I/O.

import { describe, expect, it } from "vitest";
import { prerank } from "../prerank";
import { DEFAULT_VOCABULARY } from "../config";
import type { PrerankResult, PrerankVocabulary } from "../types";
import type { RawItem } from "../../../engines/normalization/types";

// ============================================================
// Fixtures & helpers
// ============================================================

const FIXED_NOW = () => "2026-07-20T12:00:00.000Z";
const DEPS = { now: FIXED_NOW };

/** Small, fully controlled vocabulary — keeps expectations exact. */
const VOCAB: PrerankVocabulary = {
  domainTerms: ["kubernetes", "k8s", "ebpf", "observability", "security", "infrastructure"],
  roleTerms: ["engineer", "intern", "platform", "sre"],
  negativeTerms: [],
};

function item(payload: object | string, fetchedAt = "2026-07-01T00:00:00.000Z"): RawItem {
  return {
    source_type: "job_board",
    source_name: "fixture",
    raw_payload: payload,
    url: null,
    fetched_at: fetchedAt,
  };
}

/** The accounting invariant — asserted on every fixture in this file. */
function expectAccounted(result: PrerankResult, total: number): void {
  expect(result.passed.length + result.gated.length).toBe(total);
  expect(result.stats.total).toBe(total);
  expect(result.stats.passed).toBe(result.passed.length);
  expect(result.stats.gated).toBe(result.gated.length);
  const summed = Object.values(result.stats.gatedByReason).reduce((a, b) => a + b, 0);
  expect(summed).toBe(result.gated.length);
  for (const entry of result.gated) {
    expect(entry.score === null || Number.isFinite(entry.score)).toBe(true);
  }
}

function reasonFor(result: PrerankResult, target: RawItem): string | undefined {
  return result.gated.find((entry) => entry.item === target)?.reason;
}

// Relevant fixtures
const K8S_PLATFORM = item(
  "Platform Engineer, remote. You will work on Kubernetes and eBPF observability tooling for our security teams.",
);
const SRE_INTERN = item(
  "SRE Intern, fully remote position. Kubernetes infrastructure and observability across our platform.",
);

// Irrelevant fixtures (no vocabulary terms at all)
const ACCOUNTANT = item(
  "Staff Accountant, remote. Manage ledgers, invoices, quarterly closes and payroll reconciliation duties.",
);
const BARISTA = item(
  "Barista wanted for our downtown cafe. Prepare espresso drinks and serve pastries to guests daily.",
);

// ============================================================
// Core behavior
// ============================================================

describe("prerank — mixed batch", () => {
  it("passes relevant items and gates irrelevant ones", () => {
    const items = [K8S_PLATFORM, ACCOUNTANT, SRE_INTERN, BARISTA];
    const result = prerank({ items, vocabulary: VOCAB }, DEPS);

    expectAccounted(result, 4);
    expect(result.passed).toHaveLength(2);
    expect(result.passed).toContain(K8S_PLATFORM);
    expect(result.passed).toContain(SRE_INTERN);
    expect(reasonFor(result, ACCOUNTANT)).toBe("below_floor");
    expect(reasonFor(result, BARISTA)).toBe("below_floor");
    expect(result.stats.gatedByReason.below_floor).toBe(2);
    expect(result.stats.runTimestamp).toBe("2026-07-20T12:00:00.000Z");
  });

  it("zero-fills every gate reason in stats", () => {
    const result = prerank({ items: [K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(Object.keys(result.stats.gatedByReason).sort()).toEqual([
      "below_floor",
      "beyond_k",
      "insufficient_text",
      "location",
      "negative_term",
    ]);
    expectAccounted(result, 1);
  });
});

describe("prerank — determinism", () => {
  it("produces identical output for identical input", () => {
    const items = [K8S_PLATFORM, ACCOUNTANT, SRE_INTERN, BARISTA];
    const first = prerank({ items, vocabulary: VOCAB }, DEPS);
    const second = prerank({ items, vocabulary: VOCAB }, DEPS);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expectAccounted(first, 4);
    expectAccounted(second, 4);
  });
});

// ============================================================
// Hard gates — each reason triggered individually
// ============================================================

describe("prerank — gate reasons in isolation", () => {
  it("gates insufficient_text", () => {
    const tiny = item("SRE");
    const result = prerank({ items: [tiny, K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(reasonFor(result, tiny)).toBe("insufficient_text");
    expect(result.gated.find((g) => g.item === tiny)?.score).toBeNull();
    expect(result.passed).toEqual([K8S_PLATFORM]);
    expectAccounted(result, 2);
  });

  it("gates negative_term ahead of scoring", () => {
    const noisy = item(
      "Staff Accountant with Kubernetes exposure, remote. Ledgers, invoices and infrastructure billing.",
    );
    const vocabulary = { ...VOCAB, negativeTerms: ["staff accountant"] };
    const result = prerank({ items: [noisy, K8S_PLATFORM], vocabulary }, DEPS);
    expect(reasonFor(result, noisy)).toBe("negative_term");
    expect(result.gated.find((g) => g.item === noisy)?.score).toBeNull();
    expectAccounted(result, 2);
  });

  it("gates location for onsite-only items", () => {
    const onsite = item(
      "Onsite in our Bangalore hub. Kubernetes platform engineer joining the infrastructure team.",
    );
    const result = prerank({ items: [onsite, K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(reasonFor(result, onsite)).toBe("location");
    expectAccounted(result, 2);
  });

  it("treats hybrid as onsite-indicating", () => {
    const hybrid = item(
      "Hybrid role in Berlin, three days a week. Kubernetes engineer for our infrastructure platform.",
    );
    const result = prerank({ items: [hybrid, K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(reasonFor(result, hybrid)).toBe("location");
    expectAccounted(result, 2);
  });

  it("is conservative: onsite plus a remote marker passes", () => {
    const both = item(
      "We have an onsite hub in Berlin but this role is fully remote. Kubernetes engineer, infrastructure.",
    );
    const result = prerank({ items: [both, K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(result.passed).toContain(both);
    expectAccounted(result, 2);
  });

  it("is conservative: text with no location signal passes", () => {
    const silent = item(
      "Kubernetes platform engineer working on observability and security infrastructure tooling.",
    );
    const result = prerank({ items: [silent, K8S_PLATFORM], vocabulary: VOCAB }, DEPS);
    expect(result.passed).toContain(silent);
    expectAccounted(result, 2);
  });

  it("never applies the location gate when remoteOnly is false", () => {
    const onsite = item(
      "Onsite in our Bangalore hub. Kubernetes platform engineer joining the infrastructure team.",
    );
    const result = prerank(
      { items: [onsite, K8S_PLATFORM], vocabulary: VOCAB, config: { remoteOnly: false } },
      DEPS,
    );
    expect(result.passed).toContain(onsite);
    expect(result.stats.gatedByReason.location).toBe(0);
    expectAccounted(result, 2);
  });

  it("gates below_floor", () => {
    const result = prerank({ items: [K8S_PLATFORM, ACCOUNTANT], vocabulary: VOCAB }, DEPS);
    const gated = result.gated.find((g) => g.item === ACCOUNTANT);
    expect(gated?.reason).toBe("below_floor");
    expect(gated?.score).toBe(0);
    expectAccounted(result, 2);
  });

  it("gates beyond_k", () => {
    const items = [
      item("Kubernetes engineer, remote, working on observability for our platform team today."),
      item("eBPF engineer, remote, building security tracing for the infrastructure platform."),
      item("SRE, remote, owning Kubernetes infrastructure and observability across all services."),
      item("Security engineer, remote, hardening our Kubernetes platform and infrastructure."),
      item("Platform intern, remote, supporting Kubernetes observability and security tooling."),
    ];
    const result = prerank({ items, vocabulary: VOCAB, config: { maxPerRun: 2 } }, DEPS);
    expect(result.passed).toHaveLength(2);
    expect(result.stats.gatedByReason.beyond_k).toBe(3);
    for (const entry of result.gated) {
      expect(entry.reason).toBe("beyond_k");
      expect(typeof entry.score).toBe("number");
    }
    expectAccounted(result, 5);
  });
});

// ============================================================
// IDF behavior
// ============================================================

describe("prerank — IDF weighting", () => {
  it("gives ~zero weight to a term present in every item", () => {
    // "engineer" is universal here; only "ebpf" discriminates.
    const rare = item(
      "Engineer, remote, working deep in eBPF tracing internals for our runtime product.",
    );
    const common = [
      item("Engineer, remote, working on billing flows and invoice reconciliation screens."),
      item("Engineer, remote, working on marketing pages and campaign landing experiences."),
      item("Engineer, remote, working on onboarding emails and lifecycle notification copy."),
    ];
    const result = prerank(
      { items: [rare, ...common], vocabulary: VOCAB, config: { maxPerRun: 10 } },
      DEPS,
    );

    // Universal "engineer" contributes 0, so the three common items score 0.
    expect(result.passed).toEqual([rare]);
    for (const entry of result.gated) {
      expect(entry.reason).toBe("below_floor");
      expect(entry.score).toBe(0);
    }
    expectAccounted(result, 4);
  });

  it("lets a rare discriminative term dominate ranking", () => {
    const withRare = item(
      "Remote Kubernetes engineer, infrastructure platform, plus deep eBPF observability work.",
    );
    const withoutRare = item(
      "Remote Kubernetes engineer, infrastructure platform, plus general observability duties.",
    );
    const filler = item(
      "Remote Kubernetes engineer, infrastructure platform, supporting observability dashboards.",
    );
    const result = prerank(
      { items: [withoutRare, filler, withRare], vocabulary: VOCAB, config: { maxPerRun: 10 } },
      DEPS,
    );
    expect(result.passed[0]).toBe(withRare);
    expectAccounted(result, 3);
  });
});

// ============================================================
// Homogeneous-batch fallback (required fix)
// ============================================================

describe("prerank — homogeneous relevant batch", () => {
  const homogeneous = [
    item(
      "Kubernetes engineer working on infrastructure. Requisition one, apply through our careers portal.",
      "2026-07-01T00:00:00.000Z",
    ),
    item(
      "Kubernetes engineer working on infrastructure. Requisition two, apply through our careers portal.",
      "2026-07-04T00:00:00.000Z",
    ),
    item(
      "Kubernetes engineer working on infrastructure. Requisition three, apply through our careers portal.",
      "2026-07-03T00:00:00.000Z",
    ),
    item(
      "Kubernetes engineer working on infrastructure. Requisition four, apply through our careers portal.",
      "2026-07-02T00:00:00.000Z",
    ),
  ];

  it("gates nothing below_floor when every item matches the same terms", () => {
    const result = prerank({ items: homogeneous, vocabulary: VOCAB }, DEPS);
    expect(result.stats.gatedByReason.below_floor).toBe(0);
    expect(result.passed).toHaveLength(4);
    expectAccounted(result, 4);
  });

  it("still applies top-K, with recency governing equal scores", () => {
    const result = prerank({ items: homogeneous, vocabulary: VOCAB, config: { maxPerRun: 2 } }, DEPS);
    expect(result.passed).toEqual([homogeneous[1], homogeneous[2]]);
    expect(result.stats.gatedByReason.beyond_k).toBe(2);
    expectAccounted(result, 4);
  });
});

// ============================================================
// Ordering
// ============================================================

describe("prerank — ordering", () => {
  it("orders passed by score descending", () => {
    const strong = item(
      "Remote Kubernetes eBPF observability security infrastructure platform engineer role.",
    );
    const weak = item(
      "Remote generalist engineer role touching a little of everything across the product.",
    );
    const middling = item(
      "Remote Kubernetes infrastructure engineer supporting our internal developer platform.",
    );
    const result = prerank(
      { items: [weak, middling, strong], vocabulary: VOCAB, config: { maxPerRun: 10 } },
      DEPS,
    );
    expect(result.passed).toEqual([strong, middling]);
    expect(reasonFor(result, weak)).toBe("below_floor");
    expectAccounted(result, 3);
  });

  it("breaks score ties by recency, newest first", () => {
    const older = item(
      "Kubernetes engineer, remote, owning observability and security for the platform.",
      "2026-07-01T00:00:00.000Z",
    );
    const newer = item(
      "Kubernetes engineer, remote, owning observability and security for the platform.",
      "2026-07-09T00:00:00.000Z",
    );
    const other = item(
      "Infrastructure intern, remote, assisting with eBPF experiments and tracing tooling.",
    );
    const result = prerank(
      { items: [older, newer, other], vocabulary: VOCAB, config: { maxPerRun: 10 } },
      DEPS,
    );
    expect(result.passed.indexOf(newer)).toBeLessThan(result.passed.indexOf(older));
    expectAccounted(result, 3);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe("prerank — edge cases", () => {
  it("handles an empty batch", () => {
    const result = prerank({ items: [], vocabulary: VOCAB }, DEPS);
    expect(result.passed).toEqual([]);
    expect(result.gated).toEqual([]);
    expect(result.stats.total).toBe(0);
    expect(result.stats.passed).toBe(0);
    expect(result.stats.gated).toBe(0);
    for (const count of Object.values(result.stats.gatedByReason)) expect(count).toBe(0);
    expectAccounted(result, 0);
  });

  it("gates everything below_floor on an empty vocabulary, with no NaN", () => {
    const empty: PrerankVocabulary = { domainTerms: [], roleTerms: [], negativeTerms: [] };
    const items = [K8S_PLATFORM, SRE_INTERN, ACCOUNTANT];
    const result = prerank({ items, vocabulary: empty }, DEPS);
    expect(result.passed).toEqual([]);
    expect(result.stats.gatedByReason.below_floor).toBe(3);
    for (const entry of result.gated) {
      expect(entry.score).toBe(0);
      expect(Number.isNaN(entry.score as number)).toBe(false);
    }
    expectAccounted(result, 3);
  });

  it("scores string and equivalent object payloads identically", () => {
    const text =
      "Platform Engineer, remote. Kubernetes and eBPF observability tooling for security teams.";
    const asString = item(text);
    const asObject = item({
      title: "Platform Engineer, remote.",
      detail: { description: "Kubernetes and eBPF observability tooling for security teams." },
    });
    const noise = item(
      "Remote copywriter for our lifestyle blog, publishing weekly essays and newsletters.",
    );
    const result = prerank(
      { items: [asString, asObject, noise], vocabulary: VOCAB, config: { maxPerRun: 10 } },
      DEPS,
    );
    expect(result.passed).toContain(asString);
    expect(result.passed).toContain(asObject);
    expect(reasonFor(result, noise)).toBe("below_floor");
    expectAccounted(result, 3);
  });

  it("respects an explicit relevanceFloor override", () => {
    const items = [K8S_PLATFORM, SRE_INTERN, ACCOUNTANT, BARISTA];
    const result = prerank({ items, vocabulary: VOCAB, config: { relevanceFloor: 0.99 } }, DEPS);
    expect(result.passed.length).toBeLessThanOrEqual(1);
    expectAccounted(result, 4);
  });

  it("works with the shipped DEFAULT_VOCABULARY passed explicitly", () => {
    const items = [K8S_PLATFORM, SRE_INTERN, ACCOUNTANT, BARISTA];
    const result = prerank({ items, vocabulary: DEFAULT_VOCABULARY }, DEPS);
    expect(result.passed).toContain(K8S_PLATFORM);
    expect(result.passed).toContain(SRE_INTERN);
    expect(result.passed).not.toContain(BARISTA);
    expectAccounted(result, 4);
  });
});
