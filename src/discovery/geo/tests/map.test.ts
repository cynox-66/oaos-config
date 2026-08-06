// map.test.ts
// File: src/discovery/geo/tests/map.test.ts
// Purpose: Per-source geo mappers against REAL captured value shapes (the
//          2026-08-06 live census, research/phase1-eligibility) — not invented
//          fixtures (#21). Plus the partition invariant and the unknown_source
//          rule (ruling Q2).

import { describe, expect, it } from "vitest";
import type { RawItem } from "../../../engines/normalization/types";
import type { GeoPreference } from "../../scope/types";
import { geoOf } from "../map";
import { itemsPassingGeo, partitionByGeo } from "../filter";

const GEO: GeoPreference = { eligible_countries: ["IN"], worldwide_ok: true, unresolved: "pass" };

function raw(payload: unknown): RawItem {
  return {
    source_type: "job_board",
    source_name: "test",
    raw_payload: payload,
    url: "https://example.com/x",
    fetched_at: "2026-08-06T12:00:00.000Z",
  };
}

const gh = (name: string): RawItem => raw({ title: "t", location: { name } });

describe("greenhouse mapper — the four boards' measured conventions", () => {
  it('grafanalabs "X (Remote)"', () => {
    expect(geoOf("greenhouse", gh("United States (Remote)"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("India (Remote)"), GEO).status).toBe("eligible");
    expect(geoOf("greenhouse", gh("Republic of Ireland (Remote)"), GEO).status).toBe("ineligible");
  });

  it('tailscale "Remote (X)" and hybrid city forms', () => {
    expect(geoOf("greenhouse", gh("Remote (Singapore)"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("Hybrid (Denver, Colorado, United States)"), GEO).status).toBe(
      "ineligible"
    );
  });

  it('chainguard "X - Remote" and semicolon multi-value (ANY eligible segment wins)', () => {
    expect(geoOf("greenhouse", gh("United States - Remote"), GEO).status).toBe("ineligible");
    expect(
      geoOf("greenhouse", gh("Europe - Remote; United Kingdom - Remote; United States - Remote"), GEO)
        .status
    ).toBe("ineligible");
    expect(
      geoOf("greenhouse", gh("India - Remote; United States - Remote"), GEO).status
    ).toBe("eligible");
  });

  it("clickhouse's messy variants: case, missing spaces, bare countries, bare cities", () => {
    expect(geoOf("greenhouse", gh("United States (remote)"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("Singapore(Remote)"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("India (remote)"), GEO).status).toBe("eligible");
    expect(geoOf("greenhouse", gh("India"), GEO).status).toBe("eligible");
    expect(geoOf("greenhouse", gh("Bangalore"), GEO).status).toBe("eligible");
    expect(geoOf("greenhouse", gh("San Francisco, CA"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("EMEA (Remote)"), GEO).status).toBe("ineligible");
  });

  it('" or " alternatives resolve every branch', () => {
    expect(geoOf("greenhouse", gh("Toronto or Montreal"), GEO).status).toBe("ineligible");
    expect(geoOf("greenhouse", gh("Singapore or Australia (remote)"), GEO).status).toBe("ineligible");
  });

  it('"San Francisco, CA" never reads "CA" as Canada', () => {
    const signal = geoOf("greenhouse", gh("San Francisco, CA"), GEO);
    expect(signal.countries).toEqual(["US"]);
  });

  it("the bare \"(Remote)\" value (1/446 in the census) is unresolved, and empty is unresolved — never worldwide", () => {
    expect(geoOf("greenhouse", gh("(Remote)"), GEO).status).toBe("unresolved");
    expect(geoOf("greenhouse", gh(""), GEO).status).toBe("unresolved");
    expect(geoOf("greenhouse", raw({ title: "no location key" }), GEO).status).toBe("unresolved");
  });

  it("an unknown country name degrades to unresolved, not a guess", () => {
    expect(geoOf("greenhouse", gh("Ruritania (Remote)"), GEO).status).toBe("unresolved");
  });
});

describe("himalayas mapper", () => {
  const him = (restrictions: unknown): RawItem =>
    raw({ title: "t", locationRestrictions: restrictions, timezoneRestrictions: [5.5] });

  it("membership on ISO short names", () => {
    expect(geoOf("himalayas", him(["United States"]), GEO).status).toBe("ineligible");
    expect(geoOf("himalayas", him(["India"]), GEO).status).toBe("eligible");
    expect(
      geoOf("himalayas", him(["Australia", "Canada", "India", "Ireland"]), GEO).status
    ).toBe("eligible");
  });

  it("EMPTY array is the measured explicitly-worldwide shape — eligible iff worldwide_ok", () => {
    expect(geoOf("himalayas", him([]), GEO).status).toBe("eligible");
    expect(
      geoOf("himalayas", him([]), { ...GEO, worldwide_ok: false }).status
    ).toBe("ineligible");
  });

  it("timezoneRestrictions is NEVER a proxy for hire-from (Sri Lanka is also UTC+5.5)", () => {
    // The item carries tz 5.5; the location field says Sri Lanka only.
    expect(geoOf("himalayas", him(["Sri Lanka"]), GEO).status).toBe("ineligible");
  });

  it("the Hostaway case: a 148-country list without India is ineligible — membership, never length", () => {
    const emea148 = Array.from({ length: 148 }, (_, i) => `Country${i}`);
    // Every name unmapped → unresolved (visible), NOT eligible-by-length.
    expect(geoOf("himalayas", him(emea148), GEO).status).toBe("unresolved");
    // A resolvable EMEA-style list without India: ineligible.
    expect(
      geoOf("himalayas", him(["Germany", "United Kingdom", "Nigeria", "United Arab Emirates"]), GEO)
        .status
    ).toBe("ineligible");
  });

  it("a missing/non-array field is unresolved", () => {
    expect(geoOf("himalayas", raw({ title: "t" }), GEO).status).toBe("unresolved");
  });
});

describe("freehire mapper — quarantined payload, empty means UNKNOWN not worldwide", () => {
  const fh = (countries: string[] | undefined, regions: string[] | undefined): RawItem =>
    raw({
      title: "t",
      company: "c",
      source_record: { countries, regions },
      content_truncated: true,
    });

  it("lowercase ISO membership", () => {
    expect(geoOf("freehire", fh(["us"], ["north_america"]), GEO).status).toBe("ineligible");
    expect(geoOf("freehire", fh(["in"], ["apac"]), GEO).status).toBe("eligible");
    expect(geoOf("freehire", fh(["au", "ca", "in", "us"], undefined), GEO).status).toBe("eligible");
  });

  it('regions ["global"] is the explicit worldwide marker', () => {
    expect(geoOf("freehire", fh([], ["global"]), GEO).status).toBe("eligible");
    expect(geoOf("freehire", fh([], ["global"]), { ...GEO, worldwide_ok: false }).status).toBe(
      "ineligible"
    );
  });

  it("empty countries WITHOUT global is unresolved — Phase 0's missing-means-not-resolved", () => {
    expect(geoOf("freehire", fh([], []), GEO).status).toBe("unresolved");
    expect(geoOf("freehire", fh(undefined, undefined), GEO).status).toBe("unresolved");
  });
});

describe("remotive mapper — free text with an explicit Worldwide sentinel", () => {
  const rm = (value: string): RawItem => raw({ title: "t", candidate_required_location: value });

  it("measured value shapes", () => {
    expect(geoOf("remotive", rm("Worldwide"), GEO).status).toBe("eligible");
    expect(geoOf("remotive", rm("Brazil"), GEO).status).toBe("ineligible");
    expect(geoOf("remotive", rm("USA"), GEO).status).toBe("ineligible");
    expect(geoOf("remotive", rm("Americas, Europe, Asia, Africa, Oceania"), GEO).status).toBe(
      "eligible" // Asia includes IN
    );
  });

  it("timezone phrases resolve nothing but don't poison resolved segments", () => {
    expect(geoOf("remotive", rm("USA, Canada, USA timezones"), GEO).status).toBe("ineligible");
  });

  it("empty is unresolved", () => {
    expect(geoOf("remotive", rm(""), GEO).status).toBe("unresolved");
  });
});

describe("adzuna mapper — structural, evaluated not constant", () => {
  it("every item is an India posting by URL-path construction", () => {
    expect(geoOf("adzuna", raw({ title: "t" }), GEO).status).toBe("eligible");
  });

  it("an operator not eligible for IN correctly sees adzuna items gated", () => {
    expect(
      geoOf("adzuna", raw({ title: "t" }), { ...GEO, eligible_countries: ["US"] }).status
    ).toBe("ineligible");
  });
});

describe("unknown_source (ruling Q2)", () => {
  it("sources without a mapper are unknown_source, not unresolved", () => {
    for (const name of ["hn-hiring", "esoc", "nlnet", "ghsl", "lever", "workday", "ashby"]) {
      expect(geoOf(name, raw({ title: "t" }), GEO).status).toBe("unknown_source");
    }
  });
});

describe("partitionByGeo + itemsPassingGeo", () => {
  const items = [
    gh("India (Remote)"), // eligible
    gh("United States (Remote)"), // ineligible
    gh("(Remote)"), // unresolved
    raw({ title: "hn item" }), // unknown_source (attributed to hn-hiring below)
  ];
  const sourceOf = (item: RawItem): string =>
    (item.raw_payload as Record<string, unknown>).title === "hn item" ? "hn-hiring" : "greenhouse";

  it("classifies into the four buckets and the partitions sum to the input", () => {
    const partition = partitionByGeo(items, sourceOf, GEO);
    expect(partition.eligible).toHaveLength(1);
    expect(partition.ineligible).toHaveLength(1);
    expect(partition.unresolved).toHaveLength(1);
    expect(partition.unknown).toHaveLength(1);
  });

  it('under "pass", unresolved proceeds; under "gate", it does not — unknown ALWAYS proceeds', () => {
    const partition = partitionByGeo(items, sourceOf, GEO);
    expect(itemsPassingGeo(partition, GEO)).toHaveLength(3); // eligible + unresolved + unknown

    const gatePolicy: GeoPreference = { ...GEO, unresolved: "gate" };
    const gated = partitionByGeo(items, sourceOf, gatePolicy);
    const passing = itemsPassingGeo(gated, gatePolicy);
    expect(passing).toHaveLength(2); // eligible + unknown
    expect(passing).toContain(items[3]); // the unknown_source item is still there
  });
});
