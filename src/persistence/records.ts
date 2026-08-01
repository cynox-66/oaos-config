// records.ts
// File: src/persistence/records.ts
// Purpose: Pure mappers between engine types and Airtable record field shapes,
//          using the names in config.ts. Fields with no configured column are
//          folded into the per-table "Notes" (so nothing is silently lost).
//          Multi-value handling per spec: Domain → array (multi-select);
//          also_seen_in / constraint_violations → newline-joined text.

import type { AirtableRecord, Contact, OutreachDraft, Opportunity, Score } from "./types";
import { FIELD_NAMES } from "./config";

const FO = FIELD_NAMES.opportunities;
const FC = FIELD_NAMES.contacts;
const FU = FIELD_NAMES.outreach;

function lines(parts: (string | null | false | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n");
}

// ============================================================
// Opportunity
// ============================================================

/** Fields not given a dedicated column, preserved in the Opportunities "Notes". */
function opportunityNotes(o: Opportunity): string {
  return lines([
    o.description_norm ? `Description: ${o.description_norm.slice(0, 1000)}` : "",
    o.comp_basis !== "unknown"
      ? `Comp: ${o.comp_basis} (min ${o.comp_min ?? "n/a"}, max ${o.comp_max ?? "n/a"})`
      : "",
    `Remote: ${o.remote}`,
    o.location ? `Location: ${o.location}` : "",
    `Completeness: ${o.completeness.toFixed(2)}`,
    o.needs_enrichment ? "Needs enrichment: yes" : "",
    o.also_seen_in.length > 0 ? `Also seen in:\n${o.also_seen_in.join("\n")}` : "",
  ]);
}

/**
 * Build the Opportunities record fields. `score` (optional) supplies the
 * Quality/Match/Total/Tier summary columns — only the totals, never sub-factors.
 */
export function opportunityFields(o: Opportunity, score?: Score): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [FO.id]: o.id,
    [FO.company]: o.company,
    [FO.role]: o.role,
    [FO.category]: o.category,
    [FO.domain]: o.domain, // array → multi-select
    [FO.source_name]: o.source_name,
    [FO.source_url]: o.url,
    [FO.date_found]: o.date_found,
    [FO.status]: o.status,
    [FO.fingerprint]: o.fingerprint,
    [FO.notes]: opportunityNotes(o),
  };
  if (score) {
    // Only the two writable inputs are sent. Total Score and Tier are Airtable
    // formula fields (computed from Quality + Match); sending them is rejected
    // with "field is computed" (422), so we let Airtable recompute them — the
    // same rule the `oaos score` re-score PATCH follows.
    fields[FO.quality_score] = score.quality.total;
    fields[FO.match_score] = score.match.total;
  }
  return fields;
}

/**
 * Build the PATCH body for an EXISTING Opportunities record (fingerprint
 * match). Deliberately narrow: `o` here is the output of Engine 1's `merge`,
 * which is built on top of `parseOpportunity`'s read-back — and
 * `parseOpportunity` fabricates description_raw/description_norm/comp_basis/
 * remote/location/completeness/needs_enrichment/also_seen_in as blank on
 * every read (see the type below). Reusing `opportunityFields` here would
 * regenerate `Notes` from those fabricated blanks and PATCH real content back
 * to empty on every re-run of an already-ingested source. Only date_found
 * (Engine 1's duplicate-fingerprint rule) and the two writable score inputs
 * are safe to send. `also_seen_in` is NOT included: it has no dedicated
 * Airtable column (it only ever existed inside the same Notes text this
 * function must not touch), and — separately — its accumulation is already
 * moot with a single enabled source; see docs/known-issues.md #19.
 */
export function opportunityUpdateFields(o: Opportunity, score?: Score): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [FO.date_found]: o.date_found,
  };
  if (score) {
    fields[FO.quality_score] = score.quality.total;
    fields[FO.match_score] = score.match.total;
  }
  return fields;
}

/** Best-effort reconstruction of an Opportunity from a stored record (lossy:
 *  columns without a home — comp, remote, also_seen_in, … — default). Enough
 *  for the dedupe/merge path, which reads source_name + date_found. */
export function parseOpportunity(record: AirtableRecord): Opportunity {
  const f = record.fields;
  const str = (key: string): string => (typeof f[key] === "string" ? (f[key] as string) : "");
  const domain = Array.isArray(f[FO.domain]) ? (f[FO.domain] as string[]) : [];
  return {
    id: str(FO.id) || record.id,
    company: str(FO.company),
    role: str(FO.role),
    category: (str(FO.category) || "Other") as Opportunity["category"],
    domain: domain as Opportunity["domain"],
    source_name: str(FO.source_name),
    source_type: "job_board",
    url: typeof f[FO.source_url] === "string" ? (f[FO.source_url] as string) : null,
    description_raw: "",
    description_norm: "",
    comp_min: null,
    comp_max: null,
    comp_basis: "unknown",
    remote: "unknown",
    location: null,
    date_found: str(FO.date_found),
    fingerprint: str(FO.fingerprint),
    status: "Discovered",
    completeness: 0,
    needs_enrichment: false,
    also_seen_in: [],
  };
}

// ============================================================
// Contact
// ============================================================

/** Contact fields without a dedicated column, preserved in the Contacts "Notes". */
function contactNotes(c: Contact, opportunityRef: string): string {
  return lines([
    `Seniority: ${c.seniority}`,
    `Role relevance: ${c.role_relevance}`,
    c.primary ? "Primary: yes" : "",
    c.identity_uncertain ? "Identity uncertain: yes" : "",
    c.channels.slack ? `Slack: ${c.channels.slack}` : "",
    c.last_verified ? `Last verified: ${c.last_verified}` : "",
    `Opportunity: ${opportunityRef}`,
  ]);
}

/**
 * Build the Contacts record fields. `opportunityRef` (an Airtable record id or
 * our opportunity id) is recorded in Notes — the Contacts table has no
 * opportunity link column in the configured base.
 */
export function contactFields(c: Contact, opportunityRef: string): Record<string, unknown> {
  return {
    [FC.name]: c.name,
    [FC.title]: c.title,
    [FC.github_url]: c.channels.github,
    [FC.linkedin_url]: c.channels.linkedin,
    [FC.email]: c.channels.email,
    [FC.relationship]: c.relationship,
    [FC.oss_overlap]: c.oss_overlap,
    [FC.reachability]: c.reachability,
    [FC.notes]: contactNotes(c, opportunityRef),
  };
}

// ============================================================
// Outreach
// ============================================================

function outreachNotes(d: OutreachDraft): string {
  return lines([
    d.subject ? `Subject: ${d.subject}` : "",
    `Words: ${d.word_count} · Chars: ${d.char_count}`,
    d.evidence_referenced ? `Evidence: ${d.evidence_referenced}` : "",
    `Constraint pass: ${d.constraint_pass ? "yes" : "no"}`,
    d.constraint_violations.length > 0 ? `Violations:\n${d.constraint_violations.join("\n")}` : "",
    d.customization_notes ? `Notes: ${d.customization_notes}` : "",
  ]);
}

/**
 * Build the Outreach record fields. `opportunityRecordId` / `contactRecordId`
 * are Airtable record ids used for the linked Opportunity / Contact columns.
 */
export function outreachFields(
  d: OutreachDraft,
  opportunityRecordId: string,
  contactRecordId: string
): Record<string, unknown> {
  return {
    [FU.label]: `${d.channel} draft`,
    [FU.opportunity]: opportunityRecordId ? [opportunityRecordId] : [],
    [FU.contact]: contactRecordId ? [contactRecordId] : [],
    [FU.channel]: d.channel,
    [FU.draft]: d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body,
    [FU.status]: "Drafted",
    [FU.notes]: outreachNotes(d),
  };
}
