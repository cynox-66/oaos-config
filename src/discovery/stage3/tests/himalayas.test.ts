// himalayas.test.ts
// File: src/discovery/stage3/tests/himalayas.test.ts
//
// The job fixture below is a real row from the live
// GET /jobs/api/search?q=kubernetes response (2026-07-28), field values kept
// verbatim; the long HTML description is shortened.

import { describe, expect, it } from "vitest";
import { createHimalayasSource, HIMALAYAS_CONFIG } from "../sources/himalayas";
import { fixedDeps, preferencesFixture, recordingDeps, NOW } from "./query-helpers";

const job = {
  title: "Kubernetes Engineer",
  excerpt: "Kubernetes Engineer for a cleared programme.",
  companyName: "SOSi",
  companySlug: "sosi",
  employmentType: "Full Time",
  minSalary: null,
  maxSalary: null,
  salaryPeriod: "annual",
  seniority: ["Senior"],
  currency: null,
  locationRestrictions: ["United States"],
  timezoneRestrictions: [-10, -9, -8, -7, -6, -5, 14],
  categories: ["Kubernetes-Engineer", "DevOps-Engineer"],
  parentCategories: ["Developer"],
  description: "<div>We are looking for a Kubernetes Engineer to operate production clusters.</div>",
  pubDate: 1780615940,
  expiryDate: 1783207940,
  applicationLink: "https://himalayas.app/companies/sosi/jobs/kubernetes-engineer",
  guid: "https://himalayas.app/companies/sosi/jobs/kubernetes-engineer",
};

const body = (jobs: unknown[]) =>
  JSON.stringify({ comments: "", updatedAt: 1785182656, offset: 0, limit: 20, totalCount: jobs.length, jobs });

const prefs = preferencesFixture(["Kubernetes", "Security"]);

describe("himalayas query construction", () => {
  it("issues exactly one search per enabled scope field", async () => {
    const deps = fixedDeps(body([]));
    await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(deps);

    expect(deps.requests).toEqual([
      "https://himalayas.app/jobs/api/search?q=kubernetes",
      "https://himalayas.app/jobs/api/search?q=security",
    ]);
  });

  it("sends NO limit or offset — the search endpoint ignores both", async () => {
    const deps = fixedDeps(body([]));
    await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(deps);

    for (const url of deps.requests) {
      expect(url).not.toContain("limit=");
      expect(url).not.toContain("offset=");
    }
  });

  it("is driven by scope, not hardcoded terms", async () => {
    const deps = fixedDeps(body([]));
    await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["eBPF", "Observability"])).fetch(deps);

    expect(deps.requests).toEqual([
      "https://himalayas.app/jobs/api/search?q=ebpf",
      "https://himalayas.app/jobs/api/search?q=observability",
    ]);
  });

  it("url-encodes a term containing a slash", async () => {
    const deps = fixedDeps(body([]));
    await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["AI/ML"])).fetch(deps);
    expect(deps.requests).toEqual(["https://himalayas.app/jobs/api/search?q=ai%2Fml"]);
  });
});

describe("himalayas mapping", () => {
  it("maps a job to a RawItem with the payload untouched", async () => {
    const deps = recordingDeps((url) => (url.includes("q=kubernetes") ? { status: 200, body: body([job]) } : { status: 200, body: body([]) }));
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(deps);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      source_type: "job_board",
      source_name: "himalayas",
      raw_payload: job,
      url: "https://himalayas.app/companies/sosi/jobs/kubernetes-engineer",
      fetched_at: NOW,
    });
    expect(result.errors).toEqual([]);
  });

  it("does NOT quarantine — Himalayas descriptions are full text", async () => {
    const deps = fixedDeps(body([job]));
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    const payload = result.items[0].raw_payload as Record<string, unknown>;

    expect(payload.content_truncated).toBeUndefined();
    expect(payload.description).toContain("Kubernetes Engineer");
  });

  it("falls back to guid when applicationLink is missing", async () => {
    const { applicationLink, ...noLink } = job;
    const deps = fixedDeps(body([noLink]));
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    expect(result.items[0].url).toBe(job.guid);
  });

  it("dedupes the same posting surfacing under two scope terms", async () => {
    const deps = fixedDeps(body([job]));
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(deps);

    expect(deps.requests).toHaveLength(2);
    expect(result.items).toHaveLength(1);
  });
});

describe("himalayas failure modes", () => {
  it("empty results → no items, no error", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(fixedDeps(body([])));
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("a response with no jobs key at all is empty, not a shape error", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps(JSON.stringify({ totalCount: 0 }))
    );
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("non-200 → http error naming the term", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps("", 503)
    );
    expect(result.errors).toEqual([
      { scope: "himalayas:kubernetes", kind: "http", detail: "unexpected status 503" },
    ]);
  });

  it("garbage body → parse error", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps("<html>nope</html>")
    );
    expect(result.errors[0].kind).toBe("parse");
  });

  it("wrong shape → shape error", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(
      fixedDeps(JSON.stringify({ jobs: "not an array" }))
    );
    expect(result.errors[0].kind).toBe("shape");
  });

  it("one failing query does not cost the others their results", async () => {
    const deps = recordingDeps((url) =>
      url.includes("q=kubernetes") ? { status: 500, body: "" } : { status: 200, body: body([job]) }
    );
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).fetch(deps);

    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it("a thrown request is a result, never a thrown total-stop", async () => {
    const deps = fixedDeps(body([]));
    deps.httpGet = async () => {
      throw new Error("socket hang up");
    };
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture(["Kubernetes"])).fetch(deps);
    expect(result.errors[0]).toEqual({ scope: "himalayas:kubernetes", kind: "http", detail: "socket hang up" });
  });
});

describe("himalayas contract", () => {
  it("is a query_net source and refuses to build without confirmed scope", () => {
    expect(createHimalayasSource(HIMALAYAS_CONFIG, prefs).family).toBe("query_net");
    expect(() => createHimalayasSource(HIMALAYAS_CONFIG, undefined)).toThrow(/preferences\.json/);
  });

  it("healthCheck probes with ONE request, not the whole query set", async () => {
    const deps = fixedDeps(body([job]));
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).healthCheck(deps);

    expect(deps.requests).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBe(NOW);
  });

  it("healthCheck reports not-ok when the probe fails", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, prefs).healthCheck(fixedDeps("", 500));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("500");
  });

  it("healthCheck reports not-ok when the scope has no enabled field", async () => {
    const result = await createHimalayasSource(HIMALAYAS_CONFIG, preferencesFixture([], ["Data"])).healthCheck(
      fixedDeps(body([]))
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no enabled fields");
  });
});
