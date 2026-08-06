// map.ts
// File: src/discovery/geo/map.ts
// Purpose: Per-source geo mappers — each reads ITS source's own structured
//          field (measured shapes, track1-geo.md) and resolves it against the
//          operator's GeoPreference. Pure; no I/O, no network.
//
// Dispatch is by ORCHESTRATOR SOURCE NAME (the source-table row name the
// filter caller attributes items to), not by RawItem.source_name — the table
// name is the stable operator-facing identity ("greenhouse", "himalayas", …).
//
// Sources with mappers: greenhouse, himalayas, freehire, remotive, adzuna.
// Everything else (lever / workday / ashby / hn-hiring / esoc / nlnet / ghsl)
// returns `unknown_source` — ALWAYS passes the filter, reported loudly
// (ruling Q2). Lever/Workday/Ashby have structured location fields whose live
// shapes were NOT probed (track1-geo.md "Not observable"); mapping them from
// assumption would be silently inferring scope. Add their branches only from
// a measured value census.

import type { RawItem } from "../../engines/normalization/types";
import type { GeoPreference } from "../scope/types";
import { CITY_TO_ISO, countryToIso, normalizeGeoToken, regionToIsoSet } from "./countries";
import type { GeoSignal } from "./types";

/** The source names this module has mappers for. */
export const MAPPED_SOURCES: readonly string[] = [
  "greenhouse",
  "himalayas",
  "freehire",
  "remotive",
  "adzuna",
];

function record(item: RawItem): Record<string, unknown> {
  const p = item.raw_payload;
  return typeof p === "object" && p !== null ? (p as Record<string, unknown>) : {};
}

/**
 * Evaluate resolved codes/regions + unresolved leftovers against the
 * operator's eligibility. Membership tests only (the Hostaway rule): a
 * posting is eligible iff SOME resolved code is in `eligible_countries` —
 * never because its list is long, short, or mostly-anything.
 */
function evaluate(
  resolved: string[],
  hadUnresolvedToken: boolean,
  raw: string,
  geo: GeoPreference
): GeoSignal {
  const eligible = resolved.some((code) => geo.eligible_countries.includes(code));
  if (eligible) return { status: "eligible", countries: resolved, raw };
  if (hadUnresolvedToken || resolved.length === 0) {
    return { status: "unresolved", countries: resolved, raw };
  }
  return { status: "ineligible", countries: resolved, raw };
}

function worldwide(raw: string, geo: GeoPreference): GeoSignal {
  return { status: geo.worldwide_ok ? "eligible" : "ineligible", countries: [], raw };
}

/**
 * Resolve one location token through the lookup chain:
 * country name → region → city → "city, region, country" comma forms.
 * Returns the ISO codes it resolves to, or null when nothing matched.
 *
 * The comma path never resolves a bare 2-letter segment ("San Francisco, CA"
 * must not read "CA" as Canada) — only NAME tables are consulted.
 */
function resolveToken(token: string): string[] | null {
  const cleaned = normalizeGeoToken(token);
  if (cleaned === "") return null;

  const country = countryToIso(cleaned);
  if (country !== null) return [country];

  const region = regionToIsoSet(cleaned);
  if (region !== null) return [...region];

  const city = CITY_TO_ISO[cleaned];
  if (city !== undefined) return [city];

  const segments = cleaned.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (segments.length > 1) {
    const last = countryToIso(segments[segments.length - 1]);
    if (last !== null) return [last];
    const firstCity = CITY_TO_ISO[segments[0]];
    if (firstCity !== undefined) return [firstCity];
  }
  return null;
}

/**
 * Greenhouse: `location.name` is the authoritative field — populated 446/446
 * across the four activated boards (Amendment A census), in per-board format
 * variants: "X (Remote)", "Remote (X)", "X - Remote", "Hybrid (City, Region,
 * Country)", semicolon multi-value, " or " alternatives, bare countries,
 * bare cities. Strip the remote/hybrid decoration, then resolve each
 * alternative; ANY eligible alternative makes the posting eligible.
 *
 * There is no worldwide shape on company boards (measured: 0 of 446) — an
 * empty/missing value is `unresolved`, never worldwide.
 */
function mapGreenhouse(item: RawItem, geo: GeoPreference): GeoSignal {
  const payload = record(item);
  const location = payload.location;
  const name =
    typeof location === "object" && location !== null
      ? String((location as Record<string, unknown>).name ?? "")
      : "";
  const raw = name;

  const stripped = name
    .replace(/\bremote\b/gi, "")
    .replace(/\bhybrid\b/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s*-\s*$/g, "")
    .replace(/^\s*-\s*/g, "");

  const alternatives = stripped
    .split(";")
    .flatMap((s) => s.split(/\s+or\s+/i))
    .map((s) => s.replace(/^\s*-\s*|\s*-\s*$/g, "").trim())
    .filter((s) => s !== "");

  if (alternatives.length === 0) return { status: "unresolved", countries: [], raw };

  const resolved: string[] = [];
  let hadUnresolved = false;
  for (const alt of alternatives) {
    const codes = resolveToken(alt);
    if (codes === null) hadUnresolved = true;
    else resolved.push(...codes);
  }
  return evaluate([...new Set(resolved)], hadUnresolved, raw, geo);
}

/**
 * Himalayas: `locationRestrictions` — array of ISO-3166 English short names,
 * 96% populated; an EMPTY array is the measured, unambiguous
 * explicitly-worldwide shape (track1-geo.md §1a). `timezoneRestrictions` is
 * NEVER consulted: timezone overlap is not hire-from eligibility (measured:
 * tz 5.5 includes Sri Lanka-only postings).
 */
function mapHimalayas(item: RawItem, geo: GeoPreference): GeoSignal {
  const payload = record(item);
  const restrictions = payload.locationRestrictions;
  if (!Array.isArray(restrictions)) {
    return { status: "unresolved", countries: [], raw: String(restrictions ?? "") };
  }
  const raw = restrictions.join("; ");
  if (restrictions.length === 0) return worldwide(raw, geo);

  const resolved: string[] = [];
  let hadUnresolved = false;
  for (const entry of restrictions) {
    const code = typeof entry === "string" ? countryToIso(entry) : null;
    if (code === null) hadUnresolved = true;
    else resolved.push(code);
  }
  return evaluate([...new Set(resolved)], hadUnresolved, raw, geo);
}

/**
 * freehire: the original record sits quarantined under `source_record`
 * (Wave 5 content quarantine); `countries` is lowercase ISO alpha-2,
 * `regions` macro buckets with `"global"` the explicit worldwide marker.
 * Empty/missing countries WITHOUT global is `unresolved` — Phase 0's
 * measured "missing means not-resolved, not not-applicable".
 */
function mapFreehire(item: RawItem, geo: GeoPreference): GeoSignal {
  const payload = record(item);
  const source = payload.source_record;
  const rec = typeof source === "object" && source !== null ? (source as Record<string, unknown>) : {};

  const regions = Array.isArray(rec.regions) ? rec.regions.map(String) : [];
  const countries = Array.isArray(rec.countries) ? rec.countries.map(String) : [];
  const raw = `countries=[${countries.join(",")}] regions=[${regions.join(",")}]`;

  if (countries.length === 0) {
    if (regions.some((r) => normalizeGeoToken(r) === "global")) return worldwide(raw, geo);
    return { status: "unresolved", countries: [], raw };
  }

  const resolved: string[] = [];
  let hadUnresolved = false;
  for (const c of countries) {
    const code = c.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) resolved.push(code === "GB" ? "UK" : code);
    else hadUnresolved = true;
  }
  return evaluate([...new Set(resolved)], hadUnresolved, raw, geo);
}

/**
 * Remotive: `candidate_required_location` — comma-joined free text mixing
 * country names, "USA", continent/region names, and timezone phrases, with
 * an explicit "Worldwide" sentinel (measured 100% populated). Timezone
 * phrases resolve to nothing and only force `unresolved` when NO other
 * segment resolves.
 */
function mapRemotive(item: RawItem, geo: GeoPreference): GeoSignal {
  const payload = record(item);
  const value = payload.candidate_required_location;
  const raw = typeof value === "string" ? value : "";
  if (raw.trim() === "") return { status: "unresolved", countries: [], raw };

  const segments = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (segments.some((s) => normalizeGeoToken(s) === "worldwide")) return worldwide(raw, geo);

  const resolved: string[] = [];
  for (const segment of segments) {
    const codes = resolveToken(segment);
    if (codes !== null) resolved.push(...codes);
  }
  // Unresolvable segments (timezone phrases, prose) force `unresolved` only
  // when NOTHING resolved — a posting reading "USA, Canada, USA timezones"
  // is a resolved US/CA posting, not an unresolved one.
  return evaluate([...new Set(resolved)], resolved.length === 0, raw, geo);
}

/**
 * Adzuna: the country lives in the request URL path (`/jobs/in/…`), so every
 * item is an India posting BY CONSTRUCTION — the mapper encodes that
 * structural fact as `countries: ["IN"]` and evaluates membership like any
 * other source (an operator whose eligibility excluded IN would correctly
 * see these gated).
 */
function mapAdzuna(item: RawItem, geo: GeoPreference): GeoSignal {
  return evaluate(["IN"], false, "adzuna:/jobs/in (structural)", geo);
}

/**
 * Map one item's geo signal. `sourceName` is the orchestrator source-table
 * name the item is attributed to.
 */
export function geoOf(sourceName: string, item: RawItem, geo: GeoPreference): GeoSignal {
  switch (sourceName) {
    case "greenhouse":
      return mapGreenhouse(item, geo);
    case "himalayas":
      return mapHimalayas(item, geo);
    case "freehire":
      return mapFreehire(item, geo);
    case "remotive":
      return mapRemotive(item, geo);
    case "adzuna":
      return mapAdzuna(item, geo);
    default:
      return { status: "unknown_source", countries: [], raw: sourceName };
  }
}
