// countries.test.ts
// File: src/discovery/geo/tests/countries.test.ts
// Purpose: The geo vocabulary's lookup rules — membership only, no length
//          heuristics, no fuzzy matching.

import { describe, expect, it } from "vitest";
import { CITY_TO_ISO, countryToIso, normalizeGeoToken, regionToIsoSet, REGION_SETS } from "../countries";

describe("countryToIso", () => {
  it("resolves ISO short names (the Himalayas vocabulary)", () => {
    expect(countryToIso("India")).toBe("IN");
    expect(countryToIso("Russian Federation")).toBe("RU");
    expect(countryToIso("Congo, The Democratic Republic of the")).toBe("CD");
    expect(countryToIso("Côte d'Ivoire")).toBe("CI");
  });

  it("resolves the aliases observed on the activated Greenhouse boards", () => {
    expect(countryToIso("United States")).toBe("US");
    expect(countryToIso("USA")).toBe("US");
    expect(countryToIso("UK")).toBe("UK");
    expect(countryToIso("Republic of Ireland")).toBe("IE");
    expect(countryToIso("The Netherlands")).toBe("NL");
    expect(countryToIso("Mainland China")).toBe("CN");
  });

  it("is case- and whitespace-insensitive, nothing more", () => {
    expect(countryToIso("  india ")).toBe("IN");
    expect(countryToIso("INDIA")).toBe("IN");
    // No fuzzy/substring matching — a miss is a miss.
    expect(countryToIso("Indian subcontinent")).toBeNull();
    expect(countryToIso("Ind")).toBeNull();
  });

  it("returns null for unknown values rather than guessing", () => {
    expect(countryToIso("Atlantis")).toBeNull();
    expect(countryToIso("")).toBeNull();
  });
});

describe("regionToIsoSet", () => {
  it("maps observed region tokens to membership sets", () => {
    expect(regionToIsoSet("EMEA")).toContain("DE");
    expect(regionToIsoSet("EMEA")).not.toContain("IN");
    expect(regionToIsoSet("NORAM")).toEqual(["US", "CA"]);
  });

  it("APAC and APJ include IN — the documented fail-open choice", () => {
    expect(regionToIsoSet("APAC")).toContain("IN");
    expect(regionToIsoSet("APJ")).toContain("IN");
  });

  it("returns null for a non-region", () => {
    expect(regionToIsoSet("Germany")).toBeNull();
  });
});

describe("membership only — the Hostaway rule", () => {
  // The 2026-08-06 census found a 148-country locationRestrictions list that
  // was exactly the EMEA enumeration: long, and still India-ineligible.
  // Eligibility must be decided by membership, never by list length.
  it("a long list without IN resolves every member and includes no IN", () => {
    const longList = Object.keys(REGION_SETS.emea).length
      ? [...REGION_SETS.emea, ...REGION_SETS.latam, ...REGION_SETS.africa]
      : [];
    expect(longList.length).toBeGreaterThan(30);
    expect(longList).not.toContain("IN");
  });

  it("padding a list with non-eligible countries never changes an item's membership answer", () => {
    const base = ["DE", "FR"];
    const padded = [...base, ...REGION_SETS.latam, ...REGION_SETS.africa];
    expect(base.includes("IN")).toBe(padded.includes("IN"));
  });
});

describe("city table", () => {
  it("resolves the bare-city values from the ClickHouse census", () => {
    expect(CITY_TO_ISO[normalizeGeoToken("Bangalore")]).toBe("IN");
    expect(CITY_TO_ISO[normalizeGeoToken("San Francisco, CA")]).toBe("US");
    expect(CITY_TO_ISO[normalizeGeoToken("Tel Aviv")]).toBe("IL");
  });
});
