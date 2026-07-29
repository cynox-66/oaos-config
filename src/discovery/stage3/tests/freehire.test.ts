// freehire.test.ts
// File: src/discovery/stage3/tests/freehire.test.ts
//
// The row below is real, from the live
// GET /jobs/v1/jobs/search?q=site+reliability+engineer&countries=in response
// (2026-07-28), field values verbatim. The `description` is a 998-char sample
// shortened here — its LENGTH is not what the quarantine keys off, its
// provenance is.

import { describe, expect, it } from "vitest";
import { normalize } from "../../../engines/normalization";
import { createFreehireSource, FREEHIRE_CONFIG } from "../sources/freehire";
import { fixedDeps, preferencesFixture, recordingDeps, NOW } from "./query-helpers";

const row = {
  public_slug: "site-reliability-engineer-strike-jpr62upf",
  source: "himalayas",
  external_id: ":https://himalayas.app/companies/strikeusa/jobs/site-reliability-engineer-9741138047",
  url: "https://himalayas.app/companies/strikeusa/jobs/site-reliability-engineer-9741138047?utm_source=freehire.me",
  title: "Site Reliability Engineer",
  company: "Strike",
  location: "Canada, Germany, India, United Kingdom, United States",
  description: "Strike is hiring an SRE to own kubernetes reliability, observability and on-call…",
  countries: ["ca", "de", "gb", "in", "us"],
  regions: ["apac", "eu", "north_america", "uk"],
  work_mode: "remote",
  skills: ["kubernetes", "terraform"],
  is_tech: "tech",
  posted_at: "2026-07-22T20:34:41Z",
};

const body = (data: unknown[]) => JSON.stringify({ data, meta: { limit: 20, offset: 0, total: data.length } });

const prefs = preferencesFixture(["Kubernetes", "Security"]);

describe("freehire query construction", () => {
  it("issues one remote-filtered search per enabled scope field, one page each", async () => {
    const deps = fixedDeps(body([]));
    await createFreehireSource(FREEHIRE_CONFIG, prefs).fetch(deps);

    expect(deps.requests).toEqual([
      "https://freehire.dev/api/v1/jobs/search?q=kubernetes&work_mode=remote&limit=20&offset=0",
      "https://freehire.dev/api/v1/jobs/search?q=security&work_mode=remote&limit=20&offset=0",
    ]);
  });

  it("never sends the SINGULAR region/country params — they filter nothing", async () => {
    const deps = fixedDeps(body([]));
    await createFreehireSource(FREEHIRE_CONFIG, prefs).fetch(deps);

    for (const url of deps.requests) {
      expect(url).not.toMatch(/[?&]region=/);
      expect(url).not.toMatch(/[?&]country=/);
    }
  });

  it("applies no country filter — the scope is remote-only worldwide", async () => {
    const deps = fixedDeps(body([]));
    await createFreehireSource(FREEHIRE_CONFIG, prefs).fetch(deps);
    for (const url of deps.requests) expect(url).not.toContain("countries=");
  });

  it("is driven by scope, not hardcoded terms", async () => {
    const deps = fixedDeps(body([]));
    await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Data"])).fetch(deps);
    expect(deps.requests).toEqual([
      "https://freehire.dev/api/v1/jobs/search?q=data&work_mode=remote&limit=20&offset=0",
    ]);
  });
});

describe("freehire mapping and the ~1000-char quarantine", () => {
  it("maps a row to a RawItem preserving the original record untouched", async () => {
    const deps = fixedDeps(body([row]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.source_type).toBe("job_board");
    expect(item.source_name).toBe("freehire");
    expect(item.url).toBe(row.url);
    expect(item.fetched_at).toBe(NOW);
    expect((item.raw_payload as Record<string, unknown>).source_record).toEqual(row);
  });

  it("EVERY produced item is marked truncated with the freehire content source", async () => {
    const deps = fixedDeps(body([row, { ...row, url: "https://x.test/2", public_slug: "b" }]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);

    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      const payload = item.raw_payload as Record<string, unknown>;
      expect(payload.content_truncated).toBe(true);
      expect(payload.content_source).toBe("freehire:search-api-1k-cap");
      expect(payload.description_truncated).toBe(row.description);
    }
  });

  it("the capped text can NEVER present as content downstream", async () => {
    const deps = fixedDeps(body([row]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    const opportunity = normalize(result.items[0]);

    expect(opportunity.description_raw).toBe("");
    expect(opportunity.description_norm).toBe("");
    // ...but company/role survive, so the fingerprint is still meaningful.
    expect(opportunity.company).toBe("Strike");
    expect(opportunity.role).toBe("Site Reliability Engineer");
  });

  it("its content_source is distinct from Adzuna's, so the two stay distinguishable", async () => {
    const deps = fixedDeps(body([row]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    expect((result.items[0].raw_payload as Record<string, unknown>).content_source).not.toBe(
      "adzuna:search-api-500char"
    );
  });

  it("passes work_mode through verbatim rather than asserting an arrangement", async () => {
    const deps = fixedDeps(body([{ ...row, work_mode: "hybrid" }]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    expect((result.items[0].raw_payload as Record<string, unknown>).remote).toBe("hybrid");
  });

  it("dedupes a posting surfacing under two scope terms", async () => {
    const deps = fixedDeps(body([row]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, prefs).fetch(deps);
    expect(deps.requests).toHaveLength(2);
    expect(result.items).toHaveLength(1);
  });
});

describe("freehire failure modes", () => {
  it("empty results → no items, no error", async () => {
    const result = await createFreehireSource(FREEHIRE_CONFIG, prefs).fetch(fixedDeps(body([])));
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("non-200 → http error", async () => {
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps("", 502)
    );
    expect(result.errors).toEqual([{ scope: "freehire:kubernetes", kind: "http", detail: "unexpected status 502" }]);
  });

  it("garbage → parse error", async () => {
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps("not json")
    );
    expect(result.errors[0].kind).toBe("parse");
  });

  it("wrong shape → shape error", async () => {
    const result = await createFreehireSource(FREEHIRE_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps(JSON.stringify({ data: 42 }))
    );
    expect(result.errors[0].kind).toBe("shape");
  });
});

describe("freehire contract", () => {
  it("is a query_net source and refuses to build without confirmed scope", () => {
    expect(createFreehireSource(FREEHIRE_CONFIG, prefs).family).toBe("query_net");
    expect(() => createFreehireSource(FREEHIRE_CONFIG, undefined)).toThrow(/preferences\.json/);
  });

  it("healthCheck probes with ONE request", async () => {
    const deps = fixedDeps(body([row]));
    const result = await createFreehireSource(FREEHIRE_CONFIG, prefs).healthCheck(deps);
    expect(deps.requests).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});
