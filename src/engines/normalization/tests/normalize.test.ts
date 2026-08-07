// tests/normalize.test.ts
// Schema validity, determinism, compensation, completeness, edge cases, and
// dedupe/merge behavior for the Opportunity Normalization Engine.

import { describe, it, expect } from "vitest";
import { normalize, merge } from "../normalize";
import type { Opportunity, RawItem } from "../types";
import { validateOpportunity } from "./schema";
import { MANUAL_FIXTURES } from "./fixtures/manual";
import { JOB_BOARD_FIXTURES } from "./fixtures/job_board";

const ALL = [...MANUAL_FIXTURES, ...JOB_BOARD_FIXTURES];

function rawItem(over: Partial<RawItem> = {}): RawItem {
  return {
    source_type: "job_board",
    source_name: "wellfound",
    raw_payload: { company: "Acme", role: "Engineer", description: "kubernetes work" },
    url: "https://acme.com/jobs/1",
    fetched_at: "2026-06-20T10:00:00.000Z",
    ...over,
  };
}

describe("schema validation", () => {
  it("100% of fixture outputs satisfy the Opportunity schema", () => {
    for (const fx of ALL) {
      expect(validateOpportunity(normalize(fx.raw)), fx.name).toEqual([]);
    }
  });

  it("status is always 'Discovered' and also_seen_in starts empty", () => {
    for (const fx of ALL) {
      const opp = normalize(fx.raw);
      expect(opp.status).toBe("Discovered");
      expect(opp.also_seen_in).toEqual([]);
    }
  });
});

describe("remote detection from role/title", () => {
  it("detects remote from a title-only signal ('... | Remote') with no other remote field", () => {
    const opp = normalize(
      rawItem({
        raw_payload: {
          title: "Senior Software Engineer, Backend | Spain | Remote",
          description: "We build distributed systems.",
        },
      })
    );
    expect(opp.remote).toBe("remote");
  });

  it("a title with no remote/onsite/hybrid keyword leaves the result unchanged (unknown)", () => {
    const opp = normalize(
      rawItem({
        raw_payload: {
          title: "Senior Software Engineer, Backend",
          description: "We build distributed systems.",
        },
      })
    );
    expect(opp.remote).toBe("unknown");
  });
});

describe("determinism", () => {
  it("re-normalizing the same RawItem yields an identical fingerprint", () => {
    const raw = rawItem();
    expect(normalize(raw).fingerprint).toBe(normalize(raw).fingerprint);
  });

  it("re-normalizing the same RawItem yields an identical full record", () => {
    const raw = rawItem();
    expect(normalize(raw)).toEqual(normalize(raw));
  });

  it("different tracking URLs with the same host collapse to one fingerprint", () => {
    const a = normalize(rawItem({ url: "https://acme.com/jobs/1?utm=a" }));
    const b = normalize(rawItem({ url: "https://www.acme.com/jobs/1?ref=b" }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("company legal suffixes do not change the fingerprint", () => {
    const a = normalize(rawItem({ raw_payload: { company: "Acme, Inc.", role: "Engineer" } }));
    const b = normalize(rawItem({ raw_payload: { company: "Acme Ltd", role: "Engineer" } }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("compensation normalization", () => {
  const comp = (comp_raw: string) =>
    normalize(rawItem({ raw_payload: { company: "C", role: "R", comp: comp_raw } }));

  it("USD annual → INR/month (÷12, ×84), basis monthly", () => {
    const o = comp("$120000 / year");
    // 120000 * 84 / 12 = 840000
    expect(o.comp_basis).toBe("monthly");
    expect(o.comp_min).toBe(840000);
    expect(o.comp_max).toBe(840000);
  });

  it("USD hourly → monthly figure (×160), basis hourly", () => {
    const o = comp("$50 / hour");
    // 50 * 84 * 160 = 672000
    expect(o.comp_basis).toBe("hourly");
    expect(o.comp_min).toBe(672000);
  });

  it("range parses to min/max", () => {
    const o = comp("$80k - $100k / year");
    expect(o.comp_min).toBe(Math.round((80000 * 84) / 12));
    expect(o.comp_max).toBe(Math.round((100000 * 84) / 12));
  });

  it("INR monthly stays as-is (no FX)", () => {
    const o = comp("₹50,000 / month");
    expect(o.comp_basis).toBe("monthly");
    expect(o.comp_min).toBe(50000);
  });

  it("project basis keeps the total (no period conversion)", () => {
    const o = comp("$2000 per project");
    expect(o.comp_basis).toBe("project");
    expect(o.comp_min).toBe(2000 * 84);
  });

  it("equity-only → basis equity, comps null", () => {
    const o = comp("Equity only");
    expect(o.comp_basis).toBe("equity");
    expect(o.comp_min).toBeNull();
    expect(o.comp_max).toBeNull();
  });

  it("unpaid → basis unpaid, comps null", () => {
    const o = comp("Unpaid volunteer role");
    expect(o.comp_basis).toBe("unpaid");
    expect(o.comp_min).toBeNull();
  });

  it("unparseable comp → basis unknown, comps null", () => {
    const o = comp("Competitive salary, DOE");
    expect(o.comp_basis).toBe("unknown");
    expect(o.comp_min).toBeNull();
    expect(o.comp_max).toBeNull();
  });
});

describe("completeness and needs_enrichment", () => {
  it("a fully-specified item scores 1.0 and is not flagged", () => {
    const o = normalize(
      rawItem({
        raw_payload: {
          company: "Acme",
          role: "Kubernetes Engineer",
          description: "kubernetes and ebpf",
          comp: "$120000/year",
        },
      })
    );
    expect(o.completeness).toBeCloseTo(1.0, 5);
    expect(o.needs_enrichment).toBe(false);
  });

  it("a sparse item (no company/role/domain/comp/url) is flagged for enrichment", () => {
    const o = normalize(
      rawItem({ source_name: "manual", url: null, raw_payload: "some vague note" })
    );
    // Only category present → 1/6 ≈ 0.167 < 0.4
    expect(o.completeness).toBeLessThan(0.4);
    expect(o.needs_enrichment).toBe(true);
  });
});

describe("edge cases", () => {
  it("manual paste with no URL: empty host, deterministic fingerprint on company+role", () => {
    const base = (): RawItem =>
      rawItem({
        source_name: "manual",
        url: null,
        raw_payload: "Company: Acme\nRole: Platform Engineer\nterraform and devops.",
      });
    const a = normalize(base());
    const b = normalize(base());
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.company).toBe("Acme");
    expect(a.role).toBe("Platform Engineer");
  });

  it("non-English description passes through untranslated", () => {
    const text = "Ingénieur logiciel spécialisé en sécurité et réseau.";
    const o = normalize(
      rawItem({
        source_name: "manual",
        raw_payload: { company: "Société", role: "Ingénieur", description: text },
      })
    );
    expect(o.description_norm).toContain("Ingénieur");
    expect(o.description_norm).toContain("sécurité");
  });

  it("HTML is stripped and boilerplate removed in description_norm", () => {
    const o = normalize(
      rawItem({
        raw_payload: {
          company: "Acme",
          role: "Engineer",
          description:
            "<p>Build <b>kubernetes</b> tooling.</p> We are an equal opportunity employer. This site uses cookies to improve your experience.",
        },
      })
    );
    expect(o.description_norm).not.toMatch(/<[^>]+>/);
    expect(o.description_norm.toLowerCase()).not.toContain("equal opportunity");
    expect(o.description_norm.toLowerCase()).not.toContain("uses cookies");
    expect(o.description_norm).toContain("kubernetes");
  });

  it("description_raw is truncated to 5000 chars", () => {
    const long = "x".repeat(6000);
    const o = normalize(rawItem({ raw_payload: { company: "A", role: "R", description: long } }));
    expect(o.description_raw.length).toBe(5000);
  });
});

describe("dedupe / merge", () => {
  // A tiny in-memory store, exactly as a caller would use it.
  function ingest(items: RawItem[]): Map<string, Opportunity> {
    const store = new Map<string, Opportunity>();
    for (const raw of items) {
      const incoming = normalize(raw);
      const existing = store.get(incoming.fingerprint);
      if (existing) {
        store.set(incoming.fingerprint, merge(existing, incoming));
      } else {
        store.set(incoming.fingerprint, incoming);
      }
    }
    return store;
  }

  it("a same-fingerprint second item does not create a new Opportunity", () => {
    const a = rawItem({ source_name: "wellfound", url: "https://acme.com/jobs/1?a=1" });
    const b = rawItem({ source_name: "linkedin", url: "https://acme.com/jobs/1?b=2" });
    const store = ingest([a, b]);
    expect(store.size).toBe(1);
    const [opp] = [...store.values()];
    expect(opp.also_seen_in).toContain("linkedin");
  });

  it("date_found advances only when the incoming source is higher-signal (manual > automated)", () => {
    const automated = normalize(
      rawItem({ source_name: "wellfound", fetched_at: "2026-06-01T00:00:00.000Z" })
    );
    const manualLater = normalize(
      rawItem({ source_name: "manual", fetched_at: "2026-06-20T00:00:00.000Z" })
    );
    const merged = merge(automated, manualLater);
    expect(merged.date_found).toBe("2026-06-20");
    expect(merged.also_seen_in).toContain("manual");
  });

  it("date_found does NOT advance when the incoming source is lower-signal", () => {
    const manualFirst = normalize(
      rawItem({ source_name: "manual", fetched_at: "2026-06-01T00:00:00.000Z" })
    );
    const automatedLater = normalize(
      rawItem({ source_name: "wellfound", fetched_at: "2026-06-20T00:00:00.000Z" })
    );
    const merged = merge(manualFirst, automatedLater);
    expect(merged.date_found).toBe("2026-06-01");
    expect(merged.also_seen_in).toContain("wellfound");
  });

  it("merge does not duplicate an already-recorded source", () => {
    const existing = normalize(rawItem({ source_name: "wellfound" }));
    const incoming = normalize(rawItem({ source_name: "linkedin" }));
    const once = merge(existing, incoming);
    const twice = merge(once, incoming);
    expect(twice.also_seen_in).toEqual(["linkedin"]);
  });

  it("merge is pure — it does not mutate the existing record", () => {
    const existing = normalize(rawItem({ source_name: "wellfound" }));
    const snapshot = JSON.parse(JSON.stringify(existing));
    merge(existing, normalize(rawItem({ source_name: "manual" })));
    expect(existing).toEqual(snapshot);
  });
});

// Regression: docs/known-issues.md #28. Himalayas publishes the employer under
// `companyName` (camelCase); the adapter read only snake_case forms, so every
// persisted Himalayas record carried an empty Company. Key shape below is the
// real search-API shape, verified live 2026-08-07 (212/212 records carry
// `companyName`).
describe("himalayas company mapping (known-issues #28)", () => {
  const himalayasItem = (companyName: string, title: string): RawItem => ({
    source_type: "job_board",
    source_name: "himalayas",
    raw_payload: {
      companyName,
      title,
      description: "kubernetes platform work",
      applicationLink: `https://himalayas.app/companies/x/jobs/${title}`,
      guid: `https://himalayas.app/companies/x/jobs/${title}`,
    },
    url: `https://himalayas.app/companies/x/jobs/${title}`,
    fetched_at: "2026-08-07T00:00:00.000Z",
  });

  it("reads company from `companyName`, so a himalayas record is never blank", () => {
    const opp = normalize(himalayasItem("VEXXHOST Inc.", "Kubernetes Engineer"));
    expect(opp.company).toBe("VEXXHOST Inc.");
    expect(opp.company).not.toBe("");
  });

  // The harm the empty company caused: sha1(company|role|url-host) collapsed
  // every employer sharing a role title on the single himalayas.app host into
  // ONE opportunity, silently, before anything was written.
  it("does not collapse two employers sharing a role title into one fingerprint", () => {
    const a = normalize(himalayasItem("VEXXHOST Inc.", "Kubernetes Engineer"));
    const b = normalize(himalayasItem("Kong", "Kubernetes Engineer"));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("still reads the snake_case forms other boards use", () => {
    const gh = normalize(
      rawItem({ raw_payload: { company_name: "Grafana Labs", title: "Backend Engineer" } })
    );
    expect(gh.company).toBe("Grafana Labs");
  });
});
