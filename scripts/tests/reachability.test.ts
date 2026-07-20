// scripts/tests/reachability.test.ts
// Regression: calculateReachability must follow engine-specs.md §5 —
// 1 base +2 (email OR active direct channel) +1 (twitter/blog, single
// category) +1 followers>100, capped 5.

import { describe, it, expect } from "vitest";
import { calculateReachability } from "../github-contributor-scan";

const base = {
  email: null,
  blog: null,
  twitter_username: null,
  public_repos: 0,
  followers: 0,
};

describe("calculateReachability (spec §5)", () => {
  it("gives the email-equivalent +2 for an active direct channel (GitHub)", () => {
    // Rahul Jadhav's real shape: no public email, no twitter/blog, 136 followers,
    // active KubeArmor maintainer. Was scoring 2; must be >= 3 (actually 4).
    expect(calculateReachability({ ...base, followers: 136 }, true)).toBe(4);
  });

  it("without an active channel and no email, stays at base + followers", () => {
    expect(calculateReachability({ ...base, followers: 136 }, false)).toBe(2);
  });

  it("email alone earns the +2 (channel not required)", () => {
    expect(calculateReachability({ ...base, email: "a@b.com" }, false)).toBe(3);
  });

  it("email and active channel do not double-count the +2", () => {
    expect(calculateReachability({ ...base, email: "a@b.com" }, true)).toBe(3);
  });

  it("twitter and blog together are a single +1, not +1 each", () => {
    const both = calculateReachability(
      { ...base, twitter_username: "x", blog: "https://x.dev" },
      false
    );
    const one = calculateReachability({ ...base, twitter_username: "x" }, false);
    expect(both).toBe(one);
    expect(both).toBe(2); // 1 base + 1 twitter/blog
  });

  it("caps at 5", () => {
    expect(
      calculateReachability(
        { ...base, email: "a@b.com", twitter_username: "x", blog: "b", followers: 999 },
        true
      )
    ).toBe(5);
  });
});
