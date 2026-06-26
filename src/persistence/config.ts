// config.ts
// File: src/persistence/config.ts
// Purpose: Airtable table + field names as a single source of truth. These must
//          match the Airtable base AS BUILT. The repo has no record of the live
//          schema, so names live here: if one is wrong, Airtable returns a 422
//          naming the bad field, and you fix it HERE without touching logic.

/** Airtable table names (per the setup session). */
export const TABLE_NAMES = {
  opportunities: "Opportunities",
  contacts: "Contacts",
  evidence: "Evidence Assets",
  outreach: "Outreach",
} as const;

/** Field names per table. The single place to correct a name mismatch. */
export const FIELD_NAMES = {
  opportunities: {
    id: "Opportunity ID",
    company: "Company",
    role: "Role",
    category: "Category",
    domain: "Domain",
    source_name: "Source",
    source_url: "Source URL",
    date_found: "Date Found",
    status: "Status",
    fingerprint: "Fingerprint",
    quality_score: "Quality Score",
    match_score: "Match Score",
    total_score: "Total Score",
    tier: "Tier",
    notes: "Notes",
    contacts: "Contacts",
    evidence_assets: "Evidence Assets",
    outreach: "Outreach",
  },
  contacts: {
    name: "Name",
    title: "Title",
    github_url: "GitHub URL",
    linkedin_url: "LinkedIn URL",
    email: "Email",
    relationship: "Relationship",
    oss_overlap: "OSS Overlap",
    reachability: "Reachability",
    last_contacted: "Last Contacted",
    notes: "Notes",
  },
  outreach: {
    label: "Label",
    opportunity: "Opportunity",
    contact: "Contact",
    channel: "Channel",
    draft: "Draft",
    status: "Status",
    sent_date: "Sent Date",
    follow_up_status: "Follow-Up Status",
    notes: "Notes",
  },
  evidence: {
    title: "Title",
    type: "Type",
    url: "URL",
    relevance: "Relevance",
    tech_tags: "Tech Tags",
    date: "Date",
  },
} as const;

// ============================================================
// HTTP behavior
// ============================================================

/** Airtable REST API base. */
export const AIRTABLE_API_ROOT = "https://api.airtable.com/v0";

/** Max retries on HTTP 429 (after the initial attempt). */
export const MAX_RETRIES = 3;

/** Base delay (ms) for exponential backoff; tests pass 0. */
export const DEFAULT_RETRY_DELAY_MS = 250;
