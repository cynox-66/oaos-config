// types.ts
// File: src/engines/normalization/types.ts
// Purpose: Canonical type definitions for the Opportunity Normalization Engine
//          (Engine 1). Mirrors docs/engine-specs.md Section 1 exactly — field
//          names, value types, and enum members are frozen by the spec.

// ============================================================
// Enums (string literal unions — frozen by spec)
// ============================================================

/** Where a raw item originated. */
export type SourceType =
  | "job_board"
  | "internship"
  | "freelance"
  | "startup_signal"
  | "network"
  | "oss";

/** Canonical opportunity category. */
export type Category =
  | "Job"
  | "Internship"
  | "Freelance"
  | "Startup"
  | "OSS"
  | "Other";

/** How compensation is expressed. Values are normalized to INR/month or
 *  INR/project (see compensation.ts); `comp_basis` records the original basis. */
export type CompBasis =
  | "monthly"
  | "hourly"
  | "project"
  | "equity"
  | "unpaid"
  | "unknown";

/** Work arrangement. */
export type Remote = "remote" | "hybrid" | "onsite" | "unknown";

/** Controlled domain vocabulary (multi-assign). Frozen by spec Decision Rules. */
export type Domain =
  | "Cloud-Native"
  | "Kubernetes"
  | "Security"
  | "eBPF"
  | "Chaos-Engineering"
  | "Networking"
  | "DevTools"
  | "Infra"
  | "Observability"
  | "Web/Frontend"
  | "Backend"
  | "Data"
  | "AI/ML"
  | "Other";

// ============================================================
// Inputs
// ============================================================

/**
 * A heterogeneous source item, prior to normalization. One `RawItem` is routed
 * to a single source adapter (selected by `source_name`) and converted into one
 * canonical {@link Opportunity}.
 */
export interface RawItem {
  /** Coarse origin classification. */
  source_type: SourceType;
  /** Concrete source identity, e.g. "wellfound", "upwork", "lfx", "manual". */
  source_name: string;
  /** Scraped JSON, email body, or pasted text. */
  raw_payload: object | string;
  /** Canonical URL of the item, if any. */
  url: string | null;
  /** ISO-8601 datetime the item was fetched/pasted. */
  fetched_at: string;
}

// ============================================================
// Output — the canonical Opportunity record
// ============================================================

/**
 * The canonical, source-agnostic opportunity record. Every downstream engine
 * reads this one schema. Produced by {@link normalize}.
 *
 * Required fields are non-null except the allowed nullables: `url`, `comp_min`,
 * `comp_max`, `location`.
 */
export interface Opportunity {
  /** Generated, deterministic id (derived from input — see normalize.ts). */
  id: string;
  company: string;
  role: string;
  category: Category;
  /** Controlled-vocab domains, possibly empty when nothing matched. */
  domain: Domain[];
  source_name: string;
  source_type: SourceType;
  url: string | null;
  /** Trimmed raw description, max 5000 chars. */
  description_raw: string;
  /** Cleaned: HTML stripped, whitespace collapsed, boilerplate removed. */
  description_norm: string;
  /** INR/month or INR/project, normalized. Null when basis is unknown/equity/unpaid. */
  comp_min: number | null;
  comp_max: number | null;
  comp_basis: CompBasis;
  remote: Remote;
  location: string | null;
  /** ISO-8601 date (YYYY-MM-DD). */
  date_found: string;
  /** Dedupe key: sha1(company|role|url-host). See fingerprint.ts. */
  fingerprint: string;
  /** Always "Discovered" on initial normalization. */
  status: "Discovered";
  /** Fraction of core fields present, 0..1. */
  completeness: number;
  /** True when completeness < 0.4 — research engine fills before scoring. */
  needs_enrichment: boolean;
  /** source_names of duplicate sightings (populated by {@link merge}). */
  also_seen_in: string[];
}

// ============================================================
// Source adapter contract
// ============================================================

/**
 * The fields a source adapter is able to extract from a {@link RawItem}.
 * Adapters are the ONLY source-specific code; everything downstream of
 * {@link SourceAdapter.extract} is source-agnostic.
 *
 * `category` may be left null when the adapter cannot determine it — the
 * engine then infers it (see classify.ts). `comp_raw` is a free-text
 * compensation string parsed source-agnostically (see compensation.ts).
 */
export interface AdapterOutput {
  company: string | null;
  role: string | null;
  category: Category | null;
  /** Raw description text (uncleaned). May be empty. */
  description_raw: string;
  /** Raw compensation text, or null when none was present. */
  comp_raw: string | null;
  remote: Remote;
  location: string | null;
}

/**
 * A source-specific adapter. Selection is by {@link SourceAdapter.matches};
 * the first matching adapter (in registry order) handles the item.
 */
export interface SourceAdapter {
  /** Stable identifier for this adapter, e.g. "manual", "job_board". */
  readonly name: string;
  /** Whether this adapter should handle the given raw item. */
  matches(raw: RawItem): boolean;
  /** Extract whatever fields can be mapped from the raw payload. */
  extract(raw: RawItem): AdapterOutput;
}
