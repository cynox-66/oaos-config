// adzuna.test.ts
// File: src/discovery/stage3/tests/adzuna.test.ts
//
// The result below is real, from the live
// GET /v1/api/jobs/in/search/1?what=devops+remote response (2026-07-28), field
// values verbatim (including Adzuna's `__CLASS__` markers). The real
// description was EXACTLY 500 chars ending in "…"; shortened here, since what
// the quarantine keys off is provenance, not length.

import { describe, expect, it } from "vitest";
import { normalize } from "../../../engines/normalization";
import { extractText } from "../../prerank/text";
import { createAdzunaSource, ADZUNA_CONFIG } from "../sources/adzuna";
import { fixedDeps, preferencesFixture, NOW } from "./query-helpers";

const CREDENTIALS = { appId: "test-id", appKey: "test-key" };

const result = {
  id: "5816829460",
  created: "2026-07-27T03:23:59Z",
  __CLASS__: "Adzuna::API::Response::Job",
  title: "Engineer - DevOps 4A",
  company: { display_name: "Genpact India", __CLASS__: "Adzuna::API::Response::Company" },
  location: { area: ["India"], display_name: "India", __CLASS__: "Adzuna::API::Response::Location" },
  redirect_url: "https://www.adzuna.in/details/5816829460?utm_medium=api&utm_source=269ef136",
  contract_time: "full_time",
  salary_min: 600000,
  salary_max: 1200000,
  salary_is_predicted: "0",
  description: "Design and operate CI/CD and kubernetes platforms for enterprise clients. Interested candidates can share…",
  category: { tag: "it-jobs", label: "IT Jobs", __CLASS__: "Adzuna::API::Response::Category" },
};

const body = (results: unknown[]) => JSON.stringify({ results, count: results.length, mean: 0 });

const prefs = preferencesFixture(["Kubernetes", "Security"]);
const source = (p = prefs, c: typeof CREDENTIALS | undefined = CREDENTIALS) =>
  createAdzunaSource(ADZUNA_CONFIG, p, c);

describe("adzuna query construction", () => {
  it("appends ' remote' to every scope term — a bare keyword is noise here", async () => {
    const deps = fixedDeps(body([]));
    await source().fetch(deps);

    expect(deps.requests).toHaveLength(2);
    expect(deps.requests[0]).toContain("what=kubernetes+remote");
    expect(deps.requests[1]).toContain("what=security+remote");
  });

  it("requests page 1 only, date-sorted, inside the freshness window", async () => {
    const deps = fixedDeps(body([]));
    await source(preferencesFixture(["Kubernetes"])).fetch(deps);

    expect(deps.requests[0]).toBe(
      "https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=test-id&app_key=test-key" +
        "&results_per_page=20&what=kubernetes+remote&sort_by=date&max_days_old=14"
    );
  });

  it("is driven by scope, not hardcoded terms", async () => {
    const deps = fixedDeps(body([]));
    await source(preferencesFixture(["Observability"])).fetch(deps);
    expect(deps.requests[0]).toContain("what=observability+remote");
  });
});

describe("adzuna mapping and the 500-char quarantine", () => {
  it("EVERY produced item is marked truncated with the adzuna content source", async () => {
    const deps = fixedDeps(body([result, { ...result, id: "2", redirect_url: "https://x.test/2" }]));
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(deps);

    expect(fetched.items).toHaveLength(2);
    for (const item of fetched.items) {
      const payload = item.raw_payload as Record<string, unknown>;
      expect(payload.content_truncated).toBe(true);
      expect(payload.content_source).toBe("adzuna:search-api-500char");
      expect(payload.description_truncated).toBe(result.description);
    }
  });

  it("the truncated text can NEVER present as content downstream", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    const opportunity = normalize(fetched.items[0]);

    expect(opportunity.description_raw).toBe("");
    expect(opportunity.description_norm).toBe("");
  });

  it("but prerank still sees the text, so relevance still works", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    expect(extractText(fetched.items[0])).toContain("kubernetes");
  });

  it("lifts the nested company and location so fingerprints stay distinct", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    const opportunity = normalize(fetched.items[0]);

    expect(opportunity.company).toBe("Genpact India");
    expect(opportunity.role).toBe("Engineer - DevOps 4A");
    expect(opportunity.url).toBe(result.redirect_url);
  });

  it("renders the salary pair as text Engine 1 can parse", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    expect((fetched.items[0].raw_payload as Record<string, unknown>).salary).toBe("600000 - 1200000");
  });

  it("omits salary entirely when Adzuna reports none", async () => {
    const { salary_min, salary_max, ...noSalary } = result;
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([noSalary])));
    expect((fetched.items[0].raw_payload as Record<string, unknown>).salary).toBeNull();
  });

  it("asserts NO remote arrangement — we query for it, Adzuna never confirms it", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    const payload = fetched.items[0].raw_payload as Record<string, unknown>;

    expect(payload.remote).toBeUndefined();
    expect(normalize(fetched.items[0]).remote).toBe("unknown");
  });

  it("preserves the original result untouched, __CLASS__ markers and all", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps(body([result])));
    expect((fetched.items[0].raw_payload as Record<string, unknown>).source_record).toEqual(result);
  });
});

describe("adzuna failure modes", () => {
  it("count 0 → no items, no error (tight India queries legitimately return 0)", async () => {
    const fetched = await source().fetch(fixedDeps(body([])));
    expect(fetched.items).toEqual([]);
    expect(fetched.errors).toEqual([]);
  });

  it("non-200 → http error", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps("", 401));
    expect(fetched.errors).toEqual([{ scope: "adzuna:kubernetes", kind: "http", detail: "unexpected status 401" }]);
  });

  it("garbage → parse error", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(fixedDeps("<!DOCTYPE html>"));
    expect(fetched.errors[0].kind).toBe("parse");
  });

  it("wrong shape → shape error", async () => {
    const fetched = await source(preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps(JSON.stringify({ results: { nope: true } }))
    );
    expect(fetched.errors[0].kind).toBe("shape");
  });
});

describe("adzuna credentials", () => {
  it("missing credentials report clearly and send NOTHING", async () => {
    const deps = fixedDeps(body([result]));
    const fetched = await createAdzunaSource(ADZUNA_CONFIG, prefs, undefined).fetch(deps);

    expect(deps.requests).toEqual([]);
    expect(fetched.items).toEqual([]);
    expect(fetched.errors[0].detail).toContain("ADZUNA_APP_ID");
  });

  it("missing credentials are a result, not a build failure", () => {
    expect(() => createAdzunaSource(ADZUNA_CONFIG, prefs, undefined)).not.toThrow();
  });

  it("healthCheck without credentials is not-ok and makes no request", async () => {
    const deps = fixedDeps(body([]));
    const health = await createAdzunaSource(ADZUNA_CONFIG, prefs, undefined).healthCheck(deps);

    expect(deps.requests).toEqual([]);
    expect(health.ok).toBe(false);
  });
});

describe("adzuna contract", () => {
  it("is a query_net source and refuses to build without confirmed scope", () => {
    expect(source().family).toBe("query_net");
    expect(() => createAdzunaSource(ADZUNA_CONFIG, undefined, CREDENTIALS)).toThrow(/preferences\.json/);
  });

  it("healthCheck treats a clean zero-result probe as HEALTHY", async () => {
    const health = await source().healthCheck(fixedDeps(body([])));
    expect(health.ok).toBe(true);
    expect(health.checkedAt).toBe(NOW);
  });
});
