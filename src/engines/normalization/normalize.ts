// normalize.ts
// File: src/engines/normalization/normalize.ts
// Purpose: The public normalization surface — `normalize` (RawItem →
//          Opportunity) and `merge` (dedupe update of an existing record).
//          Both are pure, deterministic, side-effect-free.

import type { Opportunity, RawItem } from "./types";
import { selectAdapter } from "./adapters";
import { parseCompensation } from "./compensation";
import { deriveDomains, inferCategory } from "./classify";
import { cleanDescription, toDescriptionRaw } from "./text";
import { computeFingerprint, generateId } from "./fingerprint";

/** Threshold below which an opportunity is flagged for enrichment (spec). */
const ENRICHMENT_THRESHOLD = 0.4;

/** Number of core fields used in the completeness fraction (spec). */
const CORE_FIELD_COUNT = 6;

/** ISO date (YYYY-MM-DD) portion of an ISO-8601 datetime. */
function toIsoDate(datetime: string): string {
  return new Date(datetime).toISOString().slice(0, 10);
}

/**
 * completeness = present_core_fields / 6, where core =
 * {company, role, category, domain≥1, url, comp_basis≠unknown}.
 * `category` is always assigned (defaults to Job) and so always counts.
 */
function computeCompleteness(opp: {
  company: string;
  role: string;
  domainCount: number;
  url: string | null;
  compBasisKnown: boolean;
}): number {
  let present = 0;
  if (opp.company.trim() !== "") present++;
  if (opp.role.trim() !== "") present++;
  present++; // category is always set
  if (opp.domainCount >= 1) present++;
  if (opp.url !== null && opp.url.trim() !== "") present++;
  if (opp.compBasisKnown) present++;
  return present / CORE_FIELD_COUNT;
}

/**
 * Convert a heterogeneous {@link RawItem} into one canonical {@link Opportunity}.
 *
 * Pure and deterministic: the same RawItem always yields an identical record
 * (and identical `fingerprint`). Performs no network or file I/O. Dedupe is the
 * caller's concern — see {@link merge}.
 *
 * @param raw the source item to normalize.
 * @returns a fully-populated Opportunity with `status="Discovered"` and an
 *          empty `also_seen_in` (populated later on merge).
 */
export function normalize(raw: RawItem): Opportunity {
  const adapter = selectAdapter(raw);
  const extracted = adapter.extract(raw);

  const company = extracted.company ?? "";
  const role = extracted.role ?? "";

  const description_raw = toDescriptionRaw(extracted.description_raw);
  const description_norm = cleanDescription(description_raw);

  const { comp_min, comp_max, comp_basis } = parseCompensation(extracted.comp_raw);

  const domain = deriveDomains(role, description_norm);
  const category =
    extracted.category ?? inferCategory(raw, role, description_norm);

  const fingerprint = computeFingerprint(company, role, raw.url);
  const id = generateId(fingerprint, raw.source_name, raw.fetched_at);

  const completeness = computeCompleteness({
    company,
    role,
    domainCount: domain.length,
    url: raw.url,
    compBasisKnown: comp_basis !== "unknown",
  });

  return {
    id,
    company,
    role,
    category,
    domain,
    source_name: raw.source_name,
    source_type: raw.source_type,
    url: raw.url,
    description_raw,
    description_norm,
    comp_min,
    comp_max,
    comp_basis,
    remote: extracted.remote,
    location: extracted.location,
    date_found: toIsoDate(raw.fetched_at),
    fingerprint,
    status: "Discovered",
    completeness,
    needs_enrichment: completeness < ENRICHMENT_THRESHOLD,
    also_seen_in: [],
  };
}

/** Signal rank: a manual sighting outranks an automated one. */
function signalRank(opp: Opportunity): number {
  return opp.source_name.trim().toLowerCase() === "manual" ? 1 : 0;
}

/**
 * Fold a duplicate sighting (`incoming`, same fingerprint) into the stored
 * record (`existing`), per spec dedupe rules. Pure — returns a new record,
 * mutates nothing; the caller performs the store lookup and write.
 *
 *  - `date_found` advances to `incoming`'s only if the incoming source is
 *    higher-signal (manual > automated).
 *  - `incoming.source_name` is appended to `also_seen_in` if not already
 *    recorded there and distinct from the original source.
 *
 * @param existing the record already in the store.
 * @param incoming a freshly-normalized record with the same fingerprint.
 * @returns the updated `existing` record.
 */
export function merge(existing: Opportunity, incoming: Opportunity): Opportunity {
  const dateFound =
    signalRank(incoming) > signalRank(existing)
      ? incoming.date_found
      : existing.date_found;

  const alsoSeenIn = [...existing.also_seen_in];
  const candidate = incoming.source_name;
  if (candidate !== existing.source_name && !alsoSeenIn.includes(candidate)) {
    alsoSeenIn.push(candidate);
  }

  return { ...existing, date_found: dateFound, also_seen_in: alsoSeenIn };
}
