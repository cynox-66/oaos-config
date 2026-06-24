// fingerprint.ts
// File: src/engines/normalization/fingerprint.ts
// Purpose: Deterministic fingerprint + id derivation. The fingerprint is the
//          dedupe key; identical RawItems must always yield identical output.

import { createHash } from "crypto";
import { COMPANY_SUFFIXES } from "./config";

/** sha1 hex digest of a string. */
export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/**
 * Normalize a company name for fingerprinting: lowercase, drop punctuation,
 * strip legal-entity suffixes (Inc/Ltd/GmbH/…), collapse whitespace.
 */
export function normalizeCompany(company: string): string {
  const tokens = company
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !COMPANY_SUFFIXES.includes(t));
  return tokens.join(" ").trim();
}

/** Normalize a role for fingerprinting: lowercase, drop punctuation, collapse. */
export function normalizeRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Host-only form of a URL (lowercased, leading `www.` removed). Returns "" for
 * null/blank/unparseable URLs so the same role at different tracking URLs — and
 * manual pastes with no URL — collapse on company+role.
 */
export function hostOnly(url: string | null): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * fingerprint = sha1(lower(normalize_company) | lower(normalize_role) | host(url)).
 * Deterministic for a given (company, role, url).
 */
export function computeFingerprint(
  company: string,
  role: string,
  url: string | null
): string {
  const key = `${normalizeCompany(company)}|${normalizeRole(role)}|${hostOnly(url)}`;
  return sha1(key);
}

/**
 * Generated, deterministic opportunity id. Derived from the fingerprint plus
 * source identity and fetch time so re-normalizing the same RawItem is stable,
 * while distinct sightings remain distinguishable.
 */
export function generateId(
  fingerprint: string,
  sourceName: string,
  fetchedAt: string
): string {
  return `opp_${sha1(`${fingerprint}|${sourceName}|${fetchedAt}`).slice(0, 16)}`;
}
