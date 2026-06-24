// tests/rank.test.ts
// Reachability, role_relevance, ranking, primary selection, recruiter-last,
// seniority tie-break, determinism, and the empty path for Engine 5.

import { describe, it, expect } from "vitest";
import { rankContacts, computeReachability, computeRoleRelevance, computeSeniority } from "../rank";
import type { DiscoveryRequest } from "../types";
import { NOW, makeOpportunity, manual, candidate } from "./helpers";
import { PRIMARY_FIXTURES } from "./fixtures";

const nowMs = NOW.getTime();
const opts = { now: NOW };

describe("reachability formula (spec + GAP D)", () => {
  it("nothing → 1", () => {
    expect(computeReachability(candidate(), nowMs)).toBe(1);
  });

  it("email only → 3", () => {
    expect(computeReachability(candidate({ channels: { github: null, email: "a@b.com", linkedin: null, slack: null } }), nowMs)).toBe(3);
  });

  it("email + twitter → 4", () => {
    expect(
      computeReachability(
        candidate({ channels: { github: null, email: "a@b.com", linkedin: null, slack: null }, twitter: "t" }),
        nowMs
      )
    ).toBe(4);
  });

  it("email + twitter + followers>100 → 5", () => {
    expect(
      computeReachability(
        candidate({ channels: { github: null, email: "a@b.com", linkedin: null, slack: null }, twitter: "t", followers: 150 }),
        nowMs
      )
    ).toBe(5);
  });

  it("email + twitter + followers>100, stale → 4 (cap then −1)", () => {
    expect(
      computeReachability(
        candidate({
          channels: { github: null, email: "a@b.com", linkedin: null, slack: null },
          twitter: "t",
          followers: 150,
          last_verified: "2025-01-01",
        }),
        nowMs
      )
    ).toBe(4);
  });

  it("a direct channel (github) is email-equivalent (+2, not stacked)", () => {
    // email + github + slack still only grants a single +2.
    expect(
      computeReachability(
        candidate({ channels: { github: "gh", email: "a@b.com", linkedin: null, slack: "s" } }),
        nowMs
      )
    ).toBe(3);
  });

  it("linkedin alone is NOT a direct channel (no +2)", () => {
    expect(
      computeReachability(candidate({ channels: { github: null, email: null, linkedin: "li", slack: null } }), nowMs)
    ).toBe(1);
  });

  it("followers must be strictly > 100", () => {
    expect(computeReachability(candidate({ followers: 100 }), nowMs)).toBe(1);
    expect(computeReachability(candidate({ followers: 101 }), nowMs)).toBe(2);
  });

  it("last_verified penalty is 1 lower than an otherwise-identical fresh contact (floor 1)", () => {
    const base = { channels: { github: null, email: "a@b.com", linkedin: null, slack: null }, twitter: "t", followers: 150 };
    const fresh = computeReachability(candidate({ ...base, last_verified: "2026-05-01" }), nowMs);
    const stale = computeReachability(candidate({ ...base, last_verified: "2025-01-01" }), nowMs);
    expect(fresh).toBe(5);
    expect(stale).toBe(fresh - 1);
    // floor: a base-1 stale contact stays at 1, not 0.
    expect(computeReachability(candidate({ last_verified: "2024-01-01" }), nowMs)).toBe(1);
  });
});

describe("role_relevance (domain-aware)", () => {
  it("security/eBPF opportunity: Security Engineer outranks Recruiter", () => {
    const sec = computeRoleRelevance("Security Engineer", ["Security", "eBPF"]);
    const rec = computeRoleRelevance("Recruiter", ["Security", "eBPF"]);
    expect(sec).toBe(5);
    expect(rec).toBe(2);
    expect(sec).toBeGreaterThan(rec);
  });

  it("adjacent role scores 4, generic engineer 3, unrelated 1", () => {
    expect(computeRoleRelevance("Platform Engineer", ["Security"])).toBe(4);
    expect(computeRoleRelevance("Backend Engineer", ["Security"])).toBe(3);
    expect(computeRoleRelevance("Marketing Manager", ["Security"])).toBe(1);
  });

  it("empty domain → fallback 3", () => {
    expect(computeRoleRelevance("Security Engineer", [])).toBe(3);
  });

  it("max across multiple domains wins (best fit)", () => {
    // Frontend Engineer: core for Web/Frontend (5), generic elsewhere.
    expect(computeRoleRelevance("Frontend Engineer", ["Security", "Web/Frontend"])).toBe(5);
  });
});

describe("seniority derivation", () => {
  it("maps titles to the right tier", () => {
    expect(computeSeniority("Co-founder & CEO")).toBe("Founder");
    expect(computeSeniority("Engineering Manager")).toBe("Eng Manager");
    expect(computeSeniority("Staff Security Engineer")).toBe("Staff/Principal");
    expect(computeSeniority("Senior Engineer")).toBe("Senior");
    expect(computeSeniority("Software Engineer")).toBe("Mid");
    expect(computeSeniority("Technical Recruiter")).toBe("Recruiter");
  });
});

describe("ranking + primary selection", () => {
  it("is deterministic across runs", () => {
    const req = PRIMARY_FIXTURES[2].request;
    expect(rankContacts(req, opts)).toEqual(rankContacts(req, opts));
  });

  it("primary is a sane first choice on ≥80% of fixtures", () => {
    let hits = 0;
    const misses: string[] = [];
    for (const fx of PRIMARY_FIXTURES) {
      const result = rankContacts(fx.request, opts);
      const primary = result.ordered.find((c) => c.id === result.primary_contact_id);
      if (primary?.name === fx.expectedPrimaryName) hits++;
      else misses.push(`${fx.name}: got ${primary?.name ?? "(none)"}`);
    }
    expect(hits / PRIMARY_FIXTURES.length, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(0.8);
  });

  it("marks exactly one primary and matches primary_contact_id", () => {
    const result = rankContacts(PRIMARY_FIXTURES[0].request, opts);
    expect(result.ordered.filter((c) => c.primary).length).toBe(1);
    expect(result.ordered.find((c) => c.primary)?.id).toBe(result.primary_contact_id);
  });

  it("seniority breaks a relevance+reachability tie (Founder > Senior)", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("Sara Senior", "Senior Engineer", { email: "sara@acme.com" }),
        manual("Sam Founder", "Founder", { email: "sam@acme.com" }),
      ],
    };
    const result = rankContacts(req, opts);
    // both role_relevance 3, both reachability 3 → Founder ranks first.
    expect(result.ordered[0].name).toBe("Sam Founder");
  });
});

describe("recruiter-last rule", () => {
  it("recruiter is NOT primary when an engineer exists", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("Riya Rec", "Technical Recruiter", { email: "riya@acme.com", followers: 300, twitter: "t" }),
        manual("Eve Eng", "Security Engineer", { email: "eve@acme.com" }),
      ],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered.find((c) => c.id === result.primary_contact_id)?.name).toBe("Eve Eng");
  });

  it("recruiter IS primary when no non-recruiter exists", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [manual("Riya Rec", "Technical Recruiter", { email: "riya@acme.com" })],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered.find((c) => c.id === result.primary_contact_id)?.name).toBe("Riya Rec");
  });

  it("primary skips a top-ranked recruiter in favour of a lower-ranked non-recruiter", () => {
    // Recruiter (rel 2) outranks an unrelated person (rel 1), but primary is the non-recruiter.
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("Tom Talent", "Technical Recruiter", { email: "tom@acme.com", followers: 300, twitter: "t" }),
        manual("Dana Design", "Marketing Manager", { email: "dana@acme.com" }),
      ],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered[0].name).toBe("Tom Talent"); // recruiter sorts first by relevance
    expect(result.ordered.find((c) => c.id === result.primary_contact_id)?.name).toBe("Dana Design");
  });
});

describe("empty input", () => {
  it("no candidates → ordered=[], primary_contact_id=null", () => {
    const result = rankContacts({ opportunity: makeOpportunity() }, opts);
    expect(result.ordered).toEqual([]);
    expect(result.primary_contact_id).toBeNull();
    expect(result.opportunity_id).toBe("opp_1");
  });
});
