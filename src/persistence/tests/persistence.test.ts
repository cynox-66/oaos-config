// tests/persistence.test.ts
// Persistence tests with a mocked HTTP layer (intercepted fetch) — never a real
// Airtable base and never a real env var.

import { describe, it, expect } from "vitest";
import { createAirtableClient } from "../airtable";
import { createPersistence } from "../index";
import type { PipelineResult } from "../../pipeline/types";
import type { Opportunity } from "../../engines/normalization/types";
import type { Score } from "../../engines/scoring/types";
import type { Contact } from "../../engines/contact-ranking/types";
import type { OutreachDraft } from "../../engines/outreach-package/types";
import type { EvidenceMatch } from "../../engines/evidence-matching/types";

// ============================================================
// Mock fetch
// ============================================================

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handler: (call: Call) => Response): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url: String(url),
      method: init.method ?? "GET",
      headers: (init.headers as Record<string, string>) ?? {},
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch) {
  return createAirtableClient({ apiKey: "key123", baseId: "base1", fetchImpl, retryDelayMs: 0 });
}

// ============================================================
// Fixtures
// ============================================================

function makeOpportunity(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp_1",
    company: "Isovalent",
    role: "eBPF Security Engineer",
    category: "Job",
    domain: ["eBPF", "Security"],
    source_name: "wellfound",
    source_type: "job_board",
    url: "https://example.com/job/1",
    description_raw: "",
    description_norm: "ebpf security",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp_abc",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
    ...over,
  };
}

function makeScore(): Score {
  return {
    quality: { domain: 15, oss: 0, leverage: 15, stage: 3, total: 33 },
    match: { overlap: 20, evidence: 9, contact: 10, network: 7, total: 46 },
    total: 79,
    tier: "A",
    confidence: 0.9,
    rationale: "fits",
    scored_at: "2026-06-24T00:00:00.000Z",
    inputs_hash: "h",
    tier_uncertain: false,
  };
}

function makeContact(): Contact {
  return {
    id: "contact_1",
    name: "Ada Lin",
    company: "Isovalent",
    title: "Security Engineer",
    seniority: "Senior",
    channels: { github: "ada", email: "ada@isovalent.com", linkedin: "ada-lin", slack: null },
    reachability: 5,
    role_relevance: 5,
    oss_overlap: "KubeArmor",
    last_verified: "2026-05-01",
    primary: true,
    relationship: "GitHub Interaction",
    identity_uncertain: false,
  };
}

function makeOutreachDraft(): OutreachDraft {
  return {
    channel: "email",
    subject: "eBPF security",
    body: "Your KubeArmor eBPF work stood out.",
    word_count: 6,
    char_count: 36,
    evidence_referenced: "kubearmor",
    constraint_pass: true,
    constraint_violations: [],
    customization_notes: "verify",
  };
}

function makePipelineResult(over: Partial<PipelineResult> = {}): PipelineResult {
  const evidenceMatch: EvidenceMatch = { id: "m1", ranked: [], top_score: 0, coverage_gap: null };
  return {
    opportunity: makeOpportunity(),
    score: makeScore(),
    evidenceMatch,
    recommendation: { action: "Both", reason: "x", requires_human_review: false },
    contacts: { opportunity_id: "opp_1", ordered: [makeContact()], primary_contact_id: "contact_1" },
    applicationPackage: null,
    outreachDraft: makeOutreachDraft(),
    followUpState: null,
    timestamp: new Date("2026-06-24T00:00:00.000Z"),
    ...over,
  };
}

// ============================================================
// Tests
// ============================================================

describe("writeOpportunity", () => {
  it("POSTs to Opportunities with mapped fields and a Bearer auth header", async () => {
    const { fetchImpl, calls } = mockFetch((call) =>
      call.method === "GET" ? json({ records: [] }) : json({ id: "recNew" })
    );
    const p = createPersistence(client(fetchImpl));
    const result = await p.writeOpportunity(makeOpportunity(), makeScore());

    expect(result).toMatchObject({ success: true, operation: "create", record_id: "recNew" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://api.airtable.com/v0/base1/Opportunities");
    expect(post.headers.Authorization).toBe("Bearer key123");
    const fields = (post.body as { fields: Record<string, unknown> }).fields;
    expect(fields["Company"]).toBe("Isovalent");
    expect(fields["Total Score"]).toBe(79);
    expect(fields["Tier"]).toBe("A");
    expect(fields["Domain"]).toEqual(["eBPF", "Security"]); // array, not comma-joined
  });
});

describe("dedupe", () => {
  it("PATCHes (updates) when a record with the fingerprint already exists", async () => {
    const { fetchImpl, calls } = mockFetch((call) => {
      if (call.method === "GET") {
        return json({ records: [{ id: "recExisting", fields: { Fingerprint: "fp_abc", Source: "manual", "Date Found": "2026-06-01" } }] });
      }
      return json({ id: "recExisting" });
    });
    const p = createPersistence(client(fetchImpl));
    const result = await p.writeOpportunity(makeOpportunity(), makeScore());

    expect(result.operation).toBe("update");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("https://api.airtable.com/v0/base1/Opportunities/recExisting");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("rate limiting (429)", () => {
  it("retries up to 3 times then returns a failure WriteResult", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ error: { message: "rate limited" } }, 429));
    const result = await client(fetchImpl).createRecord("Opportunities", { Company: "X" });
    expect(result.success).toBe(false);
    expect(calls.length).toBe(4); // 1 initial + 3 retries
  });
});

describe("validation error (422)", () => {
  it("returns success=false with the Airtable error message and does not retry", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ error: { type: "INVALID", message: "Unknown field name: Foo" } }, 422));
    const result = await client(fetchImpl).createRecord("Opportunities", { Foo: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown field name: Foo");
    expect(calls.length).toBe(1);
  });
});

describe("findByFingerprint", () => {
  it("encodes the fingerprint into filterByFormula", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ records: [] }));
    const p = createPersistence(client(fetchImpl));
    const found = await p.findByFingerprint("fp_abc");

    expect(found).toBeNull();
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("filterByFormula")).toBe("{Fingerprint} = 'fp_abc'");
  });
});

describe("writePipelineResult", () => {
  it("writes Opportunity, Contact, then Outreach in sequence", async () => {
    const { fetchImpl, calls } = mockFetch((call) => {
      if (call.method === "GET") return json({ records: [] });
      if (call.url.endsWith("/Opportunities")) return json({ id: "recOpp" });
      if (call.url.endsWith("/Contacts")) return json({ id: "recContact" });
      if (call.url.endsWith("/Outreach")) return json({ id: "recOutreach" });
      return json({ id: "rec?" });
    });
    const p = createPersistence(client(fetchImpl));
    const results = await p.writePipelineResult(makePipelineResult());

    expect(results.map((r) => r.success)).toEqual([true, true, true]);
    const writes = calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url.split("/").pop()}`);
    expect(writes).toEqual(["POST Opportunities", "POST Contacts", "POST Outreach"]);

    // Outreach links to the opportunity + primary contact record ids.
    const outreach = calls.find((c) => c.url.endsWith("/Outreach"))!;
    const fields = (outreach.body as { fields: Record<string, unknown> }).fields;
    expect(fields["Opportunity"]).toEqual(["recOpp"]);
    expect(fields["Contact"]).toEqual(["recContact"]);
  });
});

describe("missing env vars", () => {
  it("throws a clear error when no key is available", () => {
    expect(() => createAirtableClient({ baseId: "b", fetchImpl: (() => {}) as unknown as typeof fetch })).toThrow(
      "Missing AIRTABLE_API_KEY — add to .env"
    );
  });
});
