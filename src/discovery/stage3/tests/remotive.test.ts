// remotive.test.ts
// File: src/discovery/stage3/tests/remotive.test.ts
//
// The job below is real, from the live GET /api/remote-jobs?category=software-dev
// response (2026-07-28), field values verbatim. Its real description was 25 KB
// of full HTML — shortened here, but NOT quarantined, because Remotive returns
// genuine full text.

import { describe, expect, it } from "vitest";
import { normalize } from "../../../engines/normalization";
import { createRemotiveSource, remotiveUrl, REMOTIVE_CONFIG } from "../sources/remotive";
import {
  createMemoryRemotiveStore,
  emptyState,
  parseRemotiveState,
  RemotiveStateError,
  serializeRemotiveState,
  utcDay,
} from "../query/remotive-state";
import { fixedDeps, preferencesFixture, NOW } from "./query-helpers";

const job = {
  id: 2091035,
  url: "https://remotive.com/remote-jobs/devops/site-reliability-engineer-2091035",
  title: "Site Reliability Engineer",
  company_name: "EverAI",
  category: "Software Development",
  tags: ["kubernetes", "sre"],
  job_type: "full_time",
  publication_date: "2026-07-24T10:33:35",
  candidate_required_location: "Worldwide",
  salary: "$30k - $100k",
  description: "<p>We run a large kubernetes estate and need an SRE to own reliability end to end.</p>",
};

const body = (jobs: unknown[]) =>
  JSON.stringify({ "00-warning": "moved", "0-legal-notice": "be nice", "job-count": jobs.length, "total-job-count": jobs.length, jobs });

const YESTERDAY = "2026-07-27";

describe("remotive request", () => {
  it("sends the category param and no limit (the API ignores limit)", async () => {
    const deps = fixedDeps(body([]));
    await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(deps);

    expect(deps.requests).toEqual(["https://remotive.com/api/remote-jobs?category=software-dev"]);
    expect(deps.requests[0]).not.toContain("limit=");
  });

  it("is scope-INDEPENDENT — the API has no free-text query, so nothing to drive", async () => {
    // Two very different scopes must produce the identical request. Faking a
    // scope dependency here would misrepresent what this API can do.
    const a = fixedDeps(body([]));
    const b = fixedDeps(body([]));
    await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(a);
    await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(b);

    expect(a.requests).toEqual(b.requests);
    expect(a.requests[0]).toBe(remotiveUrl(REMOTIVE_CONFIG));
    void preferencesFixture(["Kubernetes"]); // no constructor parameter exists to pass it to
  });
});

describe("remotive mapping", () => {
  it("maps a job to a RawItem with the payload untouched", async () => {
    const fetched = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(
      fixedDeps(body([job]))
    );

    expect(fetched.items).toEqual([
      { source_type: "job_board", source_name: "remotive", raw_payload: job, url: job.url, fetched_at: NOW },
    ]);
  });

  it("does NOT quarantine — Remotive descriptions are full text", async () => {
    const fetched = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(
      fixedDeps(body([job]))
    );
    expect((fetched.items[0].raw_payload as Record<string, unknown>).content_truncated).toBeUndefined();
    expect(normalize(fetched.items[0]).description_raw).toContain("kubernetes estate");
  });

  it("transports every category the API returns — filtering is prerank's job", async () => {
    // The live probe showed category=software-dev returning Sales and Medical
    // rows. This adapter must not quietly drop them.
    const sales = { ...job, id: 2, url: "https://x.test/2", category: "Sales" };
    const fetched = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(
      fixedDeps(body([job, sales]))
    );
    expect(fetched.items).toHaveLength(2);
  });
});

describe("the 1-call-per-day cap (structural constraint)", () => {
  it("REFUSES a second same-day call — zero requests, not merely discouraged", async () => {
    const store = createMemoryRemotiveStore();
    const source = createRemotiveSource(REMOTIVE_CONFIG, store);

    const first = fixedDeps(body([job]));
    await source.fetch(first);
    expect(first.requests).toHaveLength(1);

    const second = fixedDeps(body([job]));
    const result = await source.fetch(second);

    expect(second.requests).toEqual([]); // nothing was sent
    expect(result.items).toEqual([]);
    expect(result.errors[0].detail).toContain("refused locally, nothing was sent");
  });

  it("refuses across process boundaries — state, not memory, is the gate", async () => {
    const persisted = { lastCallDate: utcDay(NOW), lastCallAt: NOW, lastOk: true, lastDetail: "ok, 36 jobs" };
    const deps = fixedDeps(body([job]));

    // A brand-new source object, as a second `oaos discover` invocation builds.
    await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore(persisted)).fetch(deps);
    expect(deps.requests).toEqual([]);
  });

  it("allows the call again the next UTC day", async () => {
    const store = createMemoryRemotiveStore({
      lastCallDate: YESTERDAY,
      lastCallAt: `${YESTERDAY}T23:00:00.000Z`,
      lastOk: true,
      lastDetail: "ok, 36 jobs",
    });
    const deps = fixedDeps(body([job]));
    const result = await createRemotiveSource(REMOTIVE_CONFIG, store).fetch(deps);

    expect(deps.requests).toHaveLength(1);
    expect(result.items).toHaveLength(1);
  });

  it("a FAILED call still spends the day's budget", async () => {
    const store = createMemoryRemotiveStore();
    const source = createRemotiveSource(REMOTIVE_CONFIG, store);

    await source.fetch(fixedDeps("", 500));
    expect(store.read().lastCallDate).toBe(utcDay(NOW));

    const second = fixedDeps(body([job]));
    await source.fetch(second);
    expect(second.requests).toEqual([]);
  });

  it("records the outcome for healthCheck to replay", async () => {
    const store = createMemoryRemotiveStore();
    await createRemotiveSource(REMOTIVE_CONFIG, store).fetch(fixedDeps(body([job])));

    const state = store.read();
    expect(state.lastCallAt).toBe(NOW);
    expect(state.lastOk).toBe(true);
    expect(state.lastDetail).toBe("ok, 1 jobs");
  });
});

describe("remotive healthCheck never performs I/O", () => {
  it("makes NO request — otherwise the cap would be a lie", async () => {
    const store = createMemoryRemotiveStore();
    const source = createRemotiveSource(REMOTIVE_CONFIG, store);

    const fetchDeps = fixedDeps(body([job]));
    await source.fetch(fetchDeps);

    const healthDeps = fixedDeps(body([job]));
    const health = await source.healthCheck(healthDeps);

    expect(healthDeps.requests).toEqual([]);
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("ok, 1 jobs");
  });

  it("reports healthy-and-unspent before the first ever call", async () => {
    const health = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).healthCheck(
      fixedDeps(body([]))
    );
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("budget is unspent");
  });

  it("replays a failure, so a bad day is visible in the weekly report", async () => {
    const store = createMemoryRemotiveStore();
    const source = createRemotiveSource(REMOTIVE_CONFIG, store);
    await source.fetch(fixedDeps("", 503));

    const health = await source.healthCheck(fixedDeps(body([])));
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("503");
  });
});

describe("remotive failure modes", () => {
  it("non-200 → http error", async () => {
    const result = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(fixedDeps("", 429));
    expect(result.errors).toEqual([{ scope: "remotive", kind: "http", detail: "unexpected status 429" }]);
  });

  it("garbage → parse error", async () => {
    const result = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(fixedDeps("nope"));
    expect(result.errors[0].kind).toBe("parse");
  });

  it("wrong shape → shape error", async () => {
    const result = await createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).fetch(
      fixedDeps(JSON.stringify({ jobs: "no" }))
    );
    expect(result.errors[0].kind).toBe("shape");
  });

  it("refuses to build without a state store — the cap must be enforceable", () => {
    expect(() => createRemotiveSource(REMOTIVE_CONFIG, undefined)).toThrow(/cap cannot be enforced/);
  });

  it("is a query_net source", () => {
    expect(createRemotiveSource(REMOTIVE_CONFIG, createMemoryRemotiveStore()).family).toBe("query_net");
  });
});

describe("remotive state file posture", () => {
  it("round-trips through serialize/parse", () => {
    const state = { lastCallDate: "2026-07-28", lastCallAt: NOW, lastOk: true, lastDetail: "ok, 36 jobs" };
    expect(parseRemotiveState(serializeRemotiveState(state), "p")).toEqual(state);
  });

  it("an empty file THROWS rather than handing back a fresh daily budget", () => {
    expect(() => parseRemotiveState("", "discovery/remotive.json")).toThrow(RemotiveStateError);
  });

  it("invalid JSON throws naming the path", () => {
    expect(() => parseRemotiveState("{oops", "discovery/remotive.json")).toThrow(/discovery\/remotive\.json/);
  });

  it("a wrong version throws rather than being silently migrated", () => {
    expect(() => parseRemotiveState(JSON.stringify({ version: 99 }), "p")).toThrow(/version must be 1/);
  });

  it("a malformed lastCallDate throws naming the key", () => {
    const text = JSON.stringify({ version: 1, lastCallDate: "yesterday", lastCallAt: null, lastOk: null, lastDetail: null });
    expect(() => parseRemotiveState(text, "p")).toThrow(/lastCallDate/);
  });

  it("serializes the never-called state cleanly", () => {
    expect(parseRemotiveState(serializeRemotiveState(emptyState()), "p")).toEqual(emptyState());
  });

  it("utcDay rejects a non-instant instead of guessing", () => {
    expect(() => utcDay("not a date")).toThrow(RemotiveStateError);
  });
});
