// tests/reason.test.ts
// LLM reason pass: reasons attached and grounded, the fabrication trace-check
// with stricter retry, fallback on repeated fabrication / transport failure,
// and the structural-compatibility guard with Engine 2's EvidenceMatch.

import { describe, it, expect } from "vitest";
import { match } from "../match";
import { countSuspiciousTokens, fallbackReason } from "../prompt";
import type { Evidence, EvidenceMatch, MatchRequest } from "../types";
import type { EvidenceMatch as Engine2EvidenceMatch } from "../../scoring/types";
import {
  INVENTORY,
  NOW,
  makeOpportunity,
  echoBlurbClient,
  fixedReasonClient,
  countingClient,
  throwingClient,
} from "./helpers";

// Single-asset inventory → exactly one ranked result → one reason path.
const KUBEARMOR = INVENTORY.find((e) => e.id === "kubearmor") as Evidence;
const ebpfOpp = makeOpportunity({
  domain: ["eBPF", "Security"],
  role: "eBPF Security Engineer",
  description_norm: "runtime security with eBPF on Linux and Kubernetes",
});
const oneAsset: MatchRequest = { opportunity: ebpfOpp, inventory: [KUBEARMOR] };

const FABRICATED = "lorem ipsum dolor amet consectetur quantum blockchain nonsense";

describe("reason attachment + grounding", () => {
  it("attaches a non-empty reason to every ranked item", async () => {
    const result = await match({ opportunity: ebpfOpp, inventory: INVENTORY }, { client: echoBlurbClient(), now: NOW });
    expect(result.ranked.length).toBeGreaterThan(0);
    for (const r of result.ranked) {
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("grounded reasons contain no fabricated terms", async () => {
    const result = await match({ opportunity: ebpfOpp, inventory: INVENTORY }, { client: echoBlurbClient(), now: NOW });
    for (const r of result.ranked) {
      const ev = INVENTORY.find((e) => e.id === r.evidence_id) as Evidence;
      // Echoed-blurb reasons must be fully supported (zero suspicious tokens).
      expect(countSuspiciousTokens(r.reason, ev, ebpfOpp)).toBe(0);
    }
  });
});

describe("fabrication trace-check", () => {
  it("accepts a clean reason without retrying", async () => {
    const { client, state } = countingClient(() => JSON.stringify({ reason: KUBEARMOR.relevance_blurb }));
    const result = await match(oneAsset, { client, now: NOW });
    expect(state.calls).toBe(1);
    expect(result.ranked[0].reason).toBe(KUBEARMOR.relevance_blurb);
  });

  it("retries once on a fabricated reason, then uses the clean retry", async () => {
    const { client, state } = countingClient((call) =>
      call === 1 ? JSON.stringify({ reason: FABRICATED }) : JSON.stringify({ reason: KUBEARMOR.relevance_blurb })
    );
    const result = await match(oneAsset, { client, now: NOW });
    expect(state.calls).toBe(2);
    expect(result.ranked[0].reason).toBe(KUBEARMOR.relevance_blurb);
  });

  it("falls back to the (truncated) blurb when both attempts are fabricated", async () => {
    const result = await match(oneAsset, { client: fixedReasonClient(FABRICATED), now: NOW });
    expect(result.ranked[0].reason).toBe(fallbackReason(KUBEARMOR));
  });

  it("falls back to the blurb when Gemini throws", async () => {
    const result = await match(oneAsset, { client: throwingClient(), now: NOW });
    expect(result.ranked[0].reason).toBe(fallbackReason(KUBEARMOR));
  });
});

describe("EvidenceMatch id + structural compatibility", () => {
  it("derives a deterministic sha1 id and ranked[0] drives top_score", async () => {
    const result = await match(oneAsset, { client: echoBlurbClient(), now: NOW });
    expect(result.id).toMatch(/^[a-f0-9]{40}$/);
    expect(result.top_score).toBe(result.ranked[0].fit_score);
  });

  it("Engine 3 EvidenceMatch is assignable to Engine 2's input view", () => {
    // Compile-time guarantee: this only type-checks if E3 ⊆ E2 structurally.
    const assignToEngine2 = (e: EvidenceMatch): Engine2EvidenceMatch => e;
    const sample: EvidenceMatch = { id: "x", ranked: [], top_score: 0, coverage_gap: null };
    const asE2 = assignToEngine2(sample);
    expect(asE2.top_score).toBe(0);
  });
});
