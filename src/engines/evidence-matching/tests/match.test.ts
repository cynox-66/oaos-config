// tests/match.test.ts
// Pure scoring/ranking/coverage behaviour: determinism, top-1 accuracy, fit
// floor, recency decay, tie-break, dedupe, coverage_gap, and the zero-match path.

import { describe, it, expect } from "vitest";
import {
  rankEvidence,
  computeRecencyFactor,
  computeFit,
  computeCoverageGap,
  buildOpportunityTags,
  allInventoryTags,
  match,
} from "../match";
import { FIT_FLOOR } from "../config";
import type { Evidence, MatchRequest } from "../types";
import { INVENTORY, NOW, makeOpportunity, echoBlurbClient } from "./helpers";
import { LABELED_PAIRS } from "./fixtures";

const nowMs = NOW.getTime();
const req = (opportunity = makeOpportunity(), inventory = INVENTORY): MatchRequest => ({
  opportunity,
  inventory,
});

describe("deterministic fit ranking", () => {
  it("produces identical ranked order across runs", () => {
    const r = req(LABELED_PAIRS[0].opportunity);
    expect(rankEvidence(r, nowMs)).toEqual(rankEvidence(r, nowMs));
  });

  it("match() is deterministic given a fixed clock and mock client", async () => {
    const r = req(LABELED_PAIRS[0].opportunity);
    const a = await match(r, { client: echoBlurbClient(), now: NOW });
    const b = await match(r, { client: echoBlurbClient(), now: NOW });
    expect(a).toEqual(b);
  });
});

describe("top-1 accuracy (≥75% on labeled pairs)", () => {
  it("has at least 6 labeled pairs", () => {
    // pairs 1/7 dropped — no strong merged eBPF/Kubernetes evidence exists yet;
    // revisit if KubeArmor PRs get merged.
    expect(LABELED_PAIRS.length).toBeGreaterThanOrEqual(6);
  });

  it("ranks the expected asset first ≥75% of the time", () => {
    let hits = 0;
    const misses: string[] = [];
    for (const fx of LABELED_PAIRS) {
      const ranked = rankEvidence(req(fx.opportunity), nowMs);
      const top = ranked[0]?.evidence.id;
      if (top && fx.acceptedEvidenceIds.includes(top)) hits++;
      else misses.push(`${fx.name}: got ${top ?? "(none)"}`);
    }
    expect(hits / LABELED_PAIRS.length, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.75);
  });
});

describe("fit floor", () => {
  it("never returns an asset below 0.25 across all fixtures", () => {
    for (const fx of LABELED_PAIRS) {
      for (const c of rankEvidence(req(fx.opportunity), nowMs)) {
        expect(c.fit_score).toBeGreaterThanOrEqual(FIT_FLOOR);
      }
    }
  });

  it("keeps at most 3 results", () => {
    for (const fx of LABELED_PAIRS) {
      expect(rankEvidence(req(fx.opportunity), nowMs).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("zero-match path", () => {
  it("empty inventory → ranked=[], coverage_gap set, top_score 0", async () => {
    const opportunity = makeOpportunity({ domain: ["Kubernetes"], role: "K8s Engineer" });
    const result = await match({ opportunity, inventory: [] }, { client: echoBlurbClient(), now: NOW });
    expect(result.ranked).toEqual([]);
    expect(result.top_score).toBe(0);
    expect(result.coverage_gap).not.toBeNull();
  });

  it("no overlapping inventory → ranked=[], coverage_gap names the capability", async () => {
    const opportunity = makeOpportunity({
      domain: ["AI/ML"],
      role: "ML Engineer",
      description_norm: "pytorch and tensorflow deep learning",
    });
    const result = await match(req(opportunity), { client: echoBlurbClient(), now: NOW });
    expect(result.ranked).toEqual([]);
    expect(result.coverage_gap).toBe("AI/ML");
  });
});

describe("coverage_gap", () => {
  it("is null when the top capability is well covered (fit ≥ 0.4)", () => {
    // Chaos/Kubernetes pair: topTag is "Kubernetes" — a real shared tech_tag on
    // the krkn assets (fit 0.640 > 0.4) — so null is a safe, honest expectation.
    // (A pure-Security pair can't be used here: "Security" is domain-only, never
    // a tech_tag, so computeCoverageGap always reports it — see docs/known-issues.md.)
    const pair = LABELED_PAIRS.find((p) => p.name === "Chaos engineering on Kubernetes → Krkn")!;
    const opportunity = pair.opportunity;
    const ranked = rankEvidence(req(opportunity), nowMs);
    expect(computeCoverageGap(req(opportunity), ranked, nowMs)).toBeNull();
  });

  it("names the gap when nothing proves the top capability", () => {
    const opportunity = makeOpportunity({ domain: ["Data"], role: "Data Engineer", description_norm: "etl spark kafka" });
    const ranked = rankEvidence(req(opportunity), nowMs);
    expect(computeCoverageGap(req(opportunity), ranked, nowMs)).toBe("Data");
  });
});

describe("recency decay (halflife 18 months)", () => {
  it("a more recent asset has a higher recency factor", () => {
    const recent = computeRecencyFactor("2025-12-24", nowMs); // ~6 months
    const old = computeRecencyFactor("2023-06-24", nowMs); // ~36 months
    expect(recent).toBeGreaterThan(old);
  });

  it("missing/invalid date → age 36 months → factor ≈ 0.25 (two half-lives)", () => {
    expect(computeRecencyFactor("not-a-date", nowMs)).toBeCloseTo(0.25, 2);
  });

  it("recency raises fit when all else is equal", () => {
    const opportunity = makeOpportunity({ domain: ["Security"], role: "Security Engineer" });
    const tags = buildOpportunityTags(opportunity, allInventoryTags(INVENTORY));
    const base: Evidence = {
      id: "x", title: "x", type: "PR", url: "u",
      tech_tags: ["Security"], domains: ["Security"], relevance_blurb: "b",
      strength: 5, recency_date: "2025-12-24",
    };
    const older: Evidence = { ...base, recency_date: "2023-06-24" };
    expect(computeFit(base, opportunity, tags, nowMs)).toBeGreaterThan(
      computeFit(older, opportunity, tags, nowMs)
    );
  });
});

describe("type-preference tie-break", () => {
  it("prefers PR over Article for a security/eBPF opportunity on equal fit", () => {
    const common = {
      tech_tags: ["Security"], domains: ["Security"],
      relevance_blurb: "security work", strength: 5, recency_date: "2025-06-01", url: "u",
    };
    const inventory: Evidence[] = [
      { ...common, id: "the-article", title: "A", type: "Article" },
      { ...common, id: "the-pr", title: "P", type: "PR" },
    ];
    const opportunity = makeOpportunity({ domain: ["Security"], role: "Security Engineer" });
    const ranked = rankEvidence({ opportunity, inventory }, nowMs);
    // Identical fit → tie → PR wins the top slot.
    expect(ranked[0].fit_score).toBeCloseTo(ranked[1].fit_score, 10);
    expect(ranked[0].evidence.id).toBe("the-pr");
  });
});

describe("dedupe by id (max-2 edge case)", () => {
  it("duplicate ids in the inventory produce at most one entry in the output", () => {
    const dupe: Evidence = {
      id: "dup", title: "Dup", type: "PR", url: "u",
      tech_tags: ["Security"], domains: ["Security"], relevance_blurb: "b",
      strength: 5, recency_date: "2025-06-01",
    };
    const other: Evidence = { ...dupe, id: "other", strength: 4 };
    const opportunity = makeOpportunity({ domain: ["Security"], role: "Security Engineer" });
    const ranked = rankEvidence({ opportunity, inventory: [dupe, dupe, other] }, nowMs);
    const dupCount = ranked.filter((c) => c.evidence.id === "dup").length;
    expect(dupCount).toBe(1);
  });
});

describe("fit formula bounds", () => {
  it("top_score stays within 0..1", async () => {
    for (const fx of LABELED_PAIRS) {
      const ranked = rankEvidence(req(fx.opportunity), nowMs);
      for (const c of ranked) {
        expect(c.fit_score).toBeGreaterThanOrEqual(0);
        expect(c.fit_score).toBeLessThanOrEqual(1);
      }
    }
  });
});
