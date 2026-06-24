// tests/helpers.ts
// Builders for Engine 5 tests.

import type { Domain, Opportunity } from "../../normalization/types";
import type { CandidateContact, GithubScanContact, ManualContactInput } from "../types";

/** Fixed reference clock so last_verified staleness is deterministic. */
export const NOW = new Date("2026-06-24T00:00:00.000Z");

export function makeOpportunity(domain: Domain[] = ["Security", "eBPF"], id = "opp_1"): Opportunity {
  return {
    id,
    company: "Acme",
    role: "Engineer",
    category: "Job",
    domain,
    source_name: "manual",
    source_type: "job_board",
    url: null,
    description_raw: "",
    description_norm: "",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp_test",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
  };
}

/** Build a manual contact input with sensible defaults. */
export function manual(
  name: string,
  title: string,
  over: Partial<ManualContactInput> = {}
): ManualContactInput {
  return { name, company: "Acme", title, ...over };
}

/** Build a unified candidate directly (for reachability unit tests). */
export function candidate(over: Partial<CandidateContact> = {}): CandidateContact {
  return {
    name: "Test Person",
    company: "Acme",
    title: "Engineer",
    channels: { github: null, email: null, linkedin: null, slack: null },
    twitter: null,
    blog: null,
    followers: 0,
    oss_overlap: "",
    last_verified: null,
    relationship: "Cold",
    source: "manual",
    ...over,
  };
}

/** Build a GitHub scan record with defaults. */
export function scanContact(over: Partial<GithubScanContact> = {}): GithubScanContact {
  return {
    name: "Scan Person",
    github_username: "scanperson",
    github_url: "https://github.com/scanperson",
    company: "Acme",
    bio: "Security engineer",
    email: "",
    location: "",
    blog: "",
    contributions: 10,
    source_repo: "kubearmor/KubeArmor",
    twitter: "",
    followers: 0,
    airtable_title: "Security Engineer",
    airtable_relationship: "Cold",
    airtable_oss_overlap: "KubeArmor contributor — eBPF security",
    airtable_reachability: 3,
    ...over,
  };
}
