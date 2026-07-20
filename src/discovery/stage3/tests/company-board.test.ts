// company-board.test.ts
// File: src/discovery/stage3/tests/company-board.test.ts

import { describe, expect, it } from "vitest";
import { createCompanyBoardSource, SourceFetchError } from "../company-board";
import type { CompanyBoardAdapter, CompanyRegistryEntry, SourceDeps } from "../types";
import type { RawItem } from "../../../engines/normalization/types";

const now = () => "2026-07-20T00:00:00.000Z";
const deps: SourceDeps = {
  httpGet: async () => ({ status: 200, body: "" }),
  httpPost: async () => ({ status: 200, body: "" }),
  now,
};

function item(source_name: string): RawItem {
  return {
    source_type: "job_board",
    source_name,
    raw_payload: { title: "Platform Engineer" },
    url: null,
    fetched_at: now(),
  };
}

function entry(overrides: Partial<CompanyRegistryEntry>): CompanyRegistryEntry {
  return { company: "Co", platform: "greenhouse", token: "co", enabled: true, ...overrides };
}

describe("createCompanyBoardSource — fetch (registry loop)", () => {
  it("collects items across entries and preserves family/name", () => {
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async (e) => [item(`greenhouse:${e.token}`)],
    };
    const source = createCompanyBoardSource(adapter, [entry({ token: "a" }), entry({ token: "b" })]);
    expect(source.name).toBe("greenhouse");
    expect(source.family).toBe("company_board");
    expect(source.enabled).toBe(true);
    return source.fetch(deps).then((result) => {
      expect(result.items).toHaveLength(2);
      expect(result.errors).toEqual([]);
    });
  });

  it("one entry throwing SourceFetchError does not stop the others; error scope is correct", async () => {
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async (e) => {
        if (e.token === "tailscale") throw new SourceFetchError("http", "401 unauthorized");
        return [item(`greenhouse:${e.token}`)];
      },
    };
    const registry = [entry({ token: "tailscale" }), entry({ token: "grafanalabs" }), entry({ token: "fly" })];
    const result = await createCompanyBoardSource(adapter, registry).fetch(deps);

    expect(result.items).toHaveLength(2);
    expect(result.errors).toEqual([{ scope: "greenhouse:tailscale", kind: "http", detail: "401 unauthorized" }]);
  });

  it("an entry throwing a plain (untyped) Error falls back to kind 'http'", async () => {
    const adapter: CompanyBoardAdapter = {
      platform: "lever",
      fetchOne: async () => {
        throw new Error("network blew up");
      },
    };
    const result = await createCompanyBoardSource(adapter, [entry({ platform: "lever", token: "x" })]).fetch(deps);
    expect(result.errors).toEqual([{ scope: "lever:x", kind: "http", detail: "network blew up" }]);
  });

  it("an entry returning garbage (non-array) is recorded as a shape error", async () => {
    const adapter: CompanyBoardAdapter = {
      platform: "workday",
      // @ts-expect-error deliberately violating the return contract
      fetchOne: async () => ({ not: "an array" }),
    };
    const result = await createCompanyBoardSource(adapter, [entry({ platform: "workday", token: "x" })]).fetch(deps);
    expect(result.errors).toEqual([
      { scope: "workday:x", kind: "shape", detail: "adapter.fetchOne did not return an array" },
    ]);
  });

  it("disabled entries are skipped entirely", async () => {
    const seen: string[] = [];
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async (e) => {
        seen.push(e.token);
        return [];
      },
    };
    await createCompanyBoardSource(adapter, [entry({ token: "on", enabled: true }), entry({ token: "off", enabled: false })]).fetch(
      deps
    );
    expect(seen).toEqual(["on"]);
  });

  it("empty registry produces an empty result without crashing", async () => {
    const adapter: CompanyBoardAdapter = { platform: "ashby", fetchOne: async () => [] };
    const result = await createCompanyBoardSource(adapter, []).fetch(deps);
    expect(result).toEqual({ items: [], errors: [] });
  });
});

describe("createCompanyBoardSource — healthCheck (family-level, delta-5)", () => {
  it("partial failure (3 of 4 companies ok) reports ok:true with degraded detail", async () => {
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async (e) => {
        if (e.token === "tailscale") throw new SourceFetchError("http", "token expired");
        return [item(e.token)];
      },
    };
    const registry = ["tailscale", "grafanalabs", "fly", "vercel"].map((token) => entry({ token }));
    const result = await createCompanyBoardSource(adapter, registry).healthCheck(deps);

    expect(result.ok).toBe(true);
    expect(result.detail).toContain("degraded");
    expect(result.detail).toContain("greenhouse:tailscale");
    expect(result.detail).toContain("1/4");
  });

  it("total failure (every enabled entry fails) reports ok:false", async () => {
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async () => {
        throw new SourceFetchError("http", "down");
      },
    };
    const registry = [entry({ token: "a" }), entry({ token: "b" })];
    const result = await createCompanyBoardSource(adapter, registry).healthCheck(deps);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("all 2 entries failed");
  });

  it("all entries healthy reports ok:true with no degradation language", async () => {
    const adapter: CompanyBoardAdapter = { platform: "greenhouse", fetchOne: async (e) => [item(e.token)] };
    const registry = [entry({ token: "a" }), entry({ token: "b" })];
    const result = await createCompanyBoardSource(adapter, registry).healthCheck(deps);

    expect(result.ok).toBe(true);
    expect(result.detail).not.toContain("degraded");
    expect(result.detail).not.toContain("failed");
  });

  it("no enabled entries reports ok:true without calling the adapter", async () => {
    const calls: string[] = [];
    const adapter: CompanyBoardAdapter = {
      platform: "greenhouse",
      fetchOne: async (e) => {
        calls.push(e.token);
        return [];
      },
    };
    const registry = [entry({ token: "a", enabled: false })];
    const result = await createCompanyBoardSource(adapter, registry).healthCheck(deps);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });
});
