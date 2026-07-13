// types.ts
// File: src/engines/contact-ranking/types.ts
// Purpose: Type definitions for the Contact Discovery & Ranking Engine
//          (Engine 5). Mirrors docs/engine-specs.md Section 5, plus the two
//          operator-authorized fields: `relationship` (for assignability to the
//          Contact view Engines 2/4 consume) and `identity_uncertain`.

import type { Opportunity } from "../normalization/types";
import type { ContactRelationship } from "../scoring/types";

export type { Opportunity, ContactRelationship };

// ============================================================
// Enums
// ============================================================

/** Seniority tiers (spec seniority_pref order). */
export type Seniority =
  | "Founder"
  | "Eng Manager"
  | "Staff/Principal"
  | "Senior"
  | "Mid"
  | "Recruiter";

/** Outreach channels (spec Contact.channels). Values are handles/emails/urls. */
export interface Channels {
  github: string | null;
  email: string | null;
  linkedin: string | null;
  slack: string | null;
}

// ============================================================
// Output — the Contact record (spec-5 + relationship + identity_uncertain)
// ============================================================

/**
 * A ranked contact for an opportunity. Declared as a `type` (not `interface`)
 * so it carries an implicit index signature and is therefore assignable to the
 * minimal Contact view Engines 2 and 4 consume (`{ id, reachability,
 * relationship }`) — verified by a compile-time check in the tests.
 */
export type Contact = {
  id: string;
  name: string;
  company: string;
  title: string;
  seniority: Seniority;
  channels: Channels;
  /** 1..5 (spec reachability rule). */
  reachability: number;
  /** 1..5 (domain-aware role relevance). */
  role_relevance: number;
  oss_overlap: string;
  /** ISO date, or null when unknown. */
  last_verified: string | null;
  /** True for the chosen primary contact. */
  primary: boolean;
  /** Acquisition state; defaults to "Cold" for a freshly discovered contact. */
  relationship: ContactRelationship;
  /** True when this contact could not be confidently distinguished from another. */
  identity_uncertain: boolean;
  /** Airtable record id when already persisted (existing-record lookup);
   *  null/absent for newly discovered contacts. */
  existing_record_id?: string | null;
};

/** The engine's output: the ranked contacts for one opportunity. */
export interface RankedContacts {
  opportunity_id: string;
  ordered: Contact[];
  primary_contact_id: string | null;
}

// ============================================================
// Inputs — per-source raw shapes + the unified candidate
// ============================================================

/**
 * The GitHub contributor-scan output shape (from
 * scripts/github-contributor-scan.ts). Consumed by the github-scan adapter.
 */
export interface GithubScanContact {
  name: string;
  github_username: string;
  github_url: string;
  company: string;
  bio: string;
  email: string;
  location: string;
  blog: string;
  contributions: number;
  source_repo: string;
  twitter: string;
  followers: number;
  airtable_title: string;
  airtable_relationship: string;
  airtable_oss_overlap: string;
  airtable_reachability: number;
}

/** A hand-entered contact (manual LinkedIn / CNCF Slack / public team page). */
export interface ManualContactInput {
  name: string;
  company: string;
  title?: string;
  email?: string | null;
  github?: string | null;
  linkedin?: string | null;
  slack?: string | null;
  twitter?: string | null;
  blog?: string | null;
  followers?: number;
  last_verified?: string | null;
  oss_overlap?: string;
  relationship?: ContactRelationship;
  /** Airtable record id when this contact was read back from persistence
   *  (existing-record lookup) rather than newly discovered. */
  existing_record_id?: string | null;
}

/**
 * The unified candidate produced by every source adapter, carrying the raw
 * signals needed to compute reachability (twitter/blog/followers are signals,
 * not output Contact fields).
 */
export interface CandidateContact {
  name: string;
  company: string;
  title: string;
  channels: Channels;
  twitter: string | null;
  blog: string | null;
  followers: number;
  oss_overlap: string;
  last_verified: string | null;
  relationship: ContactRelationship;
  /** Provenance, e.g. "github:owner/repo" or "manual". */
  source: string;
  /** Airtable record id when already persisted; null for new discoveries. */
  existing_record_id?: string | null;
}

// ============================================================
// Request / options
// ============================================================

/**
 * Input to {@link rankContacts}: the opportunity plus pre-fetched candidate
 * source arrays (no live fetching). Each array is adapted to a
 * {@link CandidateContact} internally.
 */
export interface DiscoveryRequest {
  opportunity: Opportunity;
  githubScan?: GithubScanContact[];
  manual?: ManualContactInput[];
}

/** Optional controls for {@link rankContacts}. */
export interface RankOptions {
  /** Reference clock for the last_verified staleness check (default: now). */
  now?: Date | string;
}

/** A source adapter mapping a raw source shape to a {@link CandidateContact}. */
export interface SourceAdapter<TRaw> {
  readonly name: string;
  adapt(raw: TRaw): CandidateContact;
}
