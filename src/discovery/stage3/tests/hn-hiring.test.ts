// hn-hiring.test.ts
// File: src/discovery/stage3/tests/hn-hiring.test.ts
//
// Thread ids, titles and comment text below are real, from the live
// search_by_date + items/48747976 responses (2026-07-28). The "Who wants to be
// hired?" sibling thread is included in the search fixture because it really
// does appear at an identical timestamp — that is the trap the title filter
// exists for.

import { describe, expect, it } from "vitest";
import { createHnHiringSource, HN_CONFIG, threadSearchUrl } from "../sources/hn-hiring";
import { decodeCommentText, liftCompany, prefilterComments } from "../query/hn-prefilter";
import { fixedDeps, preferencesFixture, recordingDeps, NOW } from "./query-helpers";
import { normalize } from "../../../engines/normalization";

const HIRING_ID = "48747976";

const searchBody = JSON.stringify({
  nbHits: 506,
  hits: [
    { objectID: "48747975", title: "Ask HN: Who wants to be hired? (July 2026)", created_at: "2026-07-01T15:01:21Z" },
    { objectID: HIRING_ID, title: "Ask HN: Who is hiring? (July 2026)", created_at: "2026-07-01T15:01:21Z" },
    { objectID: "48357725", title: "Ask HN: Who is hiring? (June 2026)", created_at: "2026-06-01T15:00:48Z" },
  ],
});

const inScope = {
  id: 48748003,
  author: "smarterdx",
  created_at: "2026-07-01T16:02:00Z",
  text: "SmarterDx | Senior Platform Engineer | Remote (US only) | We run kubernetes and need help scaling it.",
};
const outOfScope = {
  id: 48747987,
  author: "caselight",
  created_at: "2026-07-01T15:30:00Z",
  text: "CaseLight is looking for a U.S.-based developer for a 20&#x2F;25% equity partnership in legal investigations.",
};

const threadBody = JSON.stringify({
  id: 48747976,
  title: "Ask HN: Who is hiring? (July 2026)",
  type: "story",
  children: [inScope, outOfScope, { id: 48748099, text: "", author: "ghost", created_at: null }],
});

function hnDeps() {
  return recordingDeps((url) => {
    if (url.startsWith(HN_CONFIG.searchByDateUrl)) return { status: 200, body: searchBody };
    if (url === `${HN_CONFIG.itemsUrl}/${HIRING_ID}`) return { status: 200, body: threadBody };
    return undefined;
  });
}

const prefs = preferencesFixture(["Kubernetes", "Security"]);

describe("hn thread selection", () => {
  it("uses search_by_date and NEVER plain search", async () => {
    const deps = hnDeps();
    await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);

    expect(deps.requests[0]).toBe(threadSearchUrl(HN_CONFIG));
    expect(deps.requests[0]).toContain("/search_by_date?");
    for (const url of deps.requests) {
      expect(url).not.toMatch(/\/api\/v1\/search\?/);
    }
  });

  it("makes exactly two requests, regardless of scope size", async () => {
    const deps = hnDeps();
    await createHnHiringSource(HN_CONFIG, preferencesFixture(["Kubernetes", "Security", "Data", "Infra"])).fetch(deps);
    expect(deps.requests).toHaveLength(2);
  });

  it("skips the 'Who wants to be hired?' sibling at the identical timestamp", async () => {
    const deps = hnDeps();
    await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);
    expect(deps.requests[1]).toBe(`${HN_CONFIG.itemsUrl}/${HIRING_ID}`);
  });

  it("reports a shape error when no hit matches the hiring-thread title", async () => {
    const deps = recordingDeps(() => ({
      status: 200,
      body: JSON.stringify({ hits: [{ objectID: "1", title: "Ask HN: Who wants to be hired? (July 2026)" }] }),
    }));
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);

    expect(deps.requests).toHaveLength(1); // never fetched a thread body
    expect(result.items).toEqual([]);
    expect(result.errors[0].kind).toBe("shape");
  });
});

describe("the prefilter runs BEFORE any parse (structural constraint)", () => {
  it("non-matching comments never become items", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());

    expect(result.items).toHaveLength(1);
    const ids = result.items.map((i) => (i.raw_payload as Record<string, unknown>).comment_id);
    expect(ids).toEqual([inScope.id]);
    expect(ids).not.toContain(outOfScope.id);
  });

  it("a scope that matches nothing yields nothing, having still fetched once", async () => {
    const deps = hnDeps();
    const result = await createHnHiringSource(HN_CONFIG, preferencesFixture(["Chaos-Engineering"])).fetch(deps);

    expect(deps.requests).toHaveLength(2);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("is driven by scope — a different enabled set keeps a different comment", async () => {
    const result = await createHnHiringSource(HN_CONFIG, preferencesFixture(["Kubernetes"])).fetch(hnDeps());
    expect(result.items).toHaveLength(1);

    const none = await createHnHiringSource(HN_CONFIG, preferencesFixture(["eBPF"])).fetch(hnDeps());
    expect(none.items).toEqual([]);
  });

  it("records which scope terms matched, for the operator's review", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    expect((result.items[0].raw_payload as Record<string, unknown>).matched_scope_terms).toEqual(["kubernetes"]);
  });
});

describe("hn mapping", () => {
  it("maps a surviving comment to a RawItem pointing at the comment permalink", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    const item = result.items[0];

    expect(item.source_type).toBe("network");
    expect(item.source_name).toBe("hn-hiring");
    expect(item.url).toBe(`https://news.ycombinator.com/item?id=${inScope.id}`);
    expect(item.fetched_at).toBe(NOW);
  });

  it("carries the FULL comment as description — it is genuine content, not truncated", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    const payload = result.items[0].raw_payload as Record<string, unknown>;

    expect(payload.description).toContain("Senior Platform Engineer");
    expect(payload.content_truncated).toBeUndefined();
  });

  it("keeps the thread identity on every item", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    const payload = result.items[0].raw_payload as Record<string, unknown>;

    expect(payload.thread_id).toBe(HIRING_ID);
    expect(payload.thread_title).toBe("Ask HN: Who is hiring? (July 2026)");
  });

  it("skips deleted/empty children without erroring", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    expect(result.errors).toEqual([]);
  });
});

describe("hn failure modes", () => {
  it("thread search non-200 → http error, thread body never fetched", async () => {
    const deps = fixedDeps("", 500);
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);

    expect(deps.requests).toHaveLength(1);
    expect(result.errors[0].kind).toBe("http");
  });

  it("thread body non-200 → http error", async () => {
    const deps = recordingDeps((url) =>
      url.startsWith(HN_CONFIG.searchByDateUrl) ? { status: 200, body: searchBody } : { status: 503, body: "" }
    );
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);
    expect(result.errors[0].kind).toBe("http");
  });

  it("garbage → parse error", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(fixedDeps("<html/>"));
    expect(result.errors[0].kind).toBe("parse");
  });

  it("wrong shape → shape error", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(fixedDeps(JSON.stringify({ hits: 3 })));
    expect(result.errors[0].kind).toBe("shape");
  });

  it("is a query_net source and refuses to build without confirmed scope", () => {
    expect(createHnHiringSource(HN_CONFIG, prefs).family).toBe("query_net");
    expect(() => createHnHiringSource(HN_CONFIG, undefined)).toThrow(/preferences\.json/);
  });

  it("healthCheck locates the thread with ONE request, never the 513 KB body", async () => {
    const deps = hnDeps();
    const health = await createHnHiringSource(HN_CONFIG, prefs).healthCheck(deps);

    expect(deps.requests).toHaveLength(1);
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("Who is hiring? (July 2026)");
  });
});

describe("the company lift (fixes the one-fingerprint-per-thread collapse)", () => {
  it("lifts the company from the first delimited segment, keeping capitalisation", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(hnDeps());
    expect((result.items[0].raw_payload as Record<string, unknown>).company).toBe("SmarterDx");
  });

  it("gives two comments from different companies DIFFERENT fingerprints", async () => {
    const two = JSON.stringify({
      id: 48747976,
      title: "Ask HN: Who is hiring? (July 2026)",
      children: [
        inScope,
        { id: 48748028, author: "cm", created_at: null, text: "Conservation Metrics | Lead Engineer | REMOTE | kubernetes" },
      ],
    });
    const deps = recordingDeps((url) =>
      url.startsWith(HN_CONFIG.searchByDateUrl) ? { status: 200, body: searchBody } : { status: 200, body: two }
    );
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);

    expect(result.items).toHaveLength(2);
    const [a, b] = result.items.map((i) => normalize(i));
    expect(a.company).toBe("SmarterDx");
    expect(b.company).toBe("Conservation Metrics");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("REGRESSION: without the lift these two collapsed onto one fingerprint", () => {
    // Live-caught 2026-07-28 — 150 of 151 comments deduped away. The control:
    // an HN-shaped payload with no company still collapses, which is why the
    // lift exists.
    const noCompany = (id: number) =>
      normalize({
        source_type: "network" as const,
        source_name: "hn-hiring",
        raw_payload: { comment_id: id, description: `posting ${id}` },
        url: `https://news.ycombinator.com/item?id=${id}`,
        fetched_at: NOW,
      });
    expect(noCompany(1).fingerprint).toBe(noCompany(2).fingerprint);
  });

  it("leaves company empty for a comment that ignores the convention", async () => {
    const prose = {
      id: 48747987,
      author: "caselight",
      created_at: null,
      text: "CaseLight is hiring a kubernetes developer. We work across legal and insurance sectors and need help.",
    };
    const body = JSON.stringify({ id: 48747976, title: "t", children: [prose] });
    const deps = recordingDeps((url) =>
      url.startsWith(HN_CONFIG.searchByDateUrl) ? { status: 200, body: searchBody } : { status: 200, body }
    );
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(deps);
    expect((result.items[0].raw_payload as Record<string, unknown>).company).toBe("");
  });
});

describe("the lift ratio guardrail", () => {
  function threadOf(children: unknown[]) {
    const body = JSON.stringify({ id: 48747976, title: "Ask HN: Who is hiring? (July 2026)", children });
    return recordingDeps((url) =>
      url.startsWith(HN_CONFIG.searchByDateUrl) ? { status: 200, body: searchBody } : { status: 200, body }
    );
  }

  const conforming = (id: number) => ({ id, author: "a", created_at: null, text: `Acme${id} | SRE | Remote | kubernetes` });
  const nonConforming = (id: number) => ({
    id,
    author: "a",
    created_at: null,
    text: `We at company ${id} are hiring a kubernetes engineer. Reach out if interested please.`,
  });

  it("reports the ratio when the convention appears to have drifted", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(
      threadOf([conforming(1), nonConforming(2), nonConforming(3), nonConforming(4)])
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe("shape");
    expect(result.errors[0].detail).toContain("company lifted from 1/4 comments");
    expect(result.errors[0].detail).toContain("delimiter convention may have changed");
  });

  it("stays silent when most comments follow the convention", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(
      threadOf([conforming(1), conforming(2), conforming(3), nonConforming(4)])
    );
    expect(result.errors).toEqual([]);
  });

  it("is loud but NOT auto-disabling — healthCheck stays green", async () => {
    // A convention change is not the source being broken. The signal belongs
    // in the run summary, not in the health state machine.
    const deps = threadOf([nonConforming(1), nonConforming(2)]);
    const source = createHnHiringSource(HN_CONFIG, prefs);

    const fetched = await source.fetch(deps);
    expect(fetched.errors).toHaveLength(1);

    const health = await source.healthCheck(threadOf([]));
    expect(health.ok).toBe(true);
  });

  it("does not fire on an empty thread — no comments is not a drift signal", async () => {
    const result = await createHnHiringSource(HN_CONFIG, prefs).fetch(threadOf([]));
    expect(result.errors).toEqual([]);
  });
});

describe("prefilter unit behaviour", () => {
  it("decodes HN's entity set and strips tags", () => {
    expect(decodeCommentText("<p>a&#x2F;b &amp; c&#x27;s</p>")).toBe("a/b & c's");
  });

  it("matches on word boundaries — 'sre' does not hit inside 'stressed'", () => {
    const { passed, rejected } = prefilterComments([{ id: 1, text: "we are stressed" }], ["sre"]);
    expect(passed).toEqual([]);
    expect(rejected).toEqual([1]);
  });

  it("reports every rejected id — nothing is dropped silently", () => {
    const comments = [
      { id: 1, text: "kubernetes platform" },
      { id: 2, text: "marketing copywriter" },
      { id: 3, text: "sales lead" },
    ];
    const result = prefilterComments(comments, ["kubernetes"]);
    expect(result.passed.map((p) => p.comment.id)).toEqual([1]);
    expect(result.rejected).toEqual([2, 3]);
  });

  it("keeps every term that matched, in the order the terms were given", () => {
    const result = prefilterComments([{ id: 1, text: "kubernetes and security work" }], ["security", "kubernetes"]);
    expect(result.passed[0].matched).toEqual(["security", "kubernetes"]);
  });

  it("no terms means nothing passes — an empty scope searches for nothing", () => {
    expect(prefilterComments([{ id: 1, text: "kubernetes" }], []).passed).toEqual([]);
  });
});

describe("liftCompany guards", () => {
  it("takes the first delimited segment", () => {
    expect(liftCompany("SmarterDx | Senior Engineer | Remote (US)")).toBe("SmarterDx");
  });

  it("returns null with no delimiter at all", () => {
    expect(liftCompany("We are hiring a platform engineer")).toBeNull();
  });

  it("returns null on an empty first segment", () => {
    expect(liftCompany("  | Role | Remote")).toBeNull();
  });

  it("rejects an over-long segment", () => {
    expect(liftCompany(`${"x".repeat(61)} | Role`)).toBeNull();
  });

  it("rejects a segment with too many words", () => {
    expect(liftCompany("one two three four five six seven eight nine | Role")).toBeNull();
  });

  it("rejects prose containing a sentence break", () => {
    expect(liftCompany("We build things. Join us | Role")).toBeNull();
  });

  it("accepts a trailing period — 'Acme Inc.' is a company name", () => {
    expect(liftCompany("Acme Inc. | Role | Remote")).toBe("Acme Inc.");
  });
});
