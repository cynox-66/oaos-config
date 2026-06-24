// adapters/github-scan.ts
// File: src/engines/contact-ranking/adapters/github-scan.ts
// Purpose: Adapt the output of scripts/github-contributor-scan.ts into the
//          unified CandidateContact. Does NOT modify the scan script.

import type {
  CandidateContact,
  ContactRelationship,
  GithubScanContact,
  SourceAdapter,
} from "../types";

const RELATIONSHIPS: ContactRelationship[] = [
  "Met",
  "Warm",
  "GitHub Interaction",
  "Slack",
  "Cold",
];

/** Empty string → null (the scan uses "" for absent values). */
function emptyToNull(s: string | null | undefined): string | null {
  return s && s.trim() !== "" ? s.trim() : null;
}

/** Coerce a scan relationship string to a ContactRelationship (default Cold). */
function toRelationship(value: string): ContactRelationship {
  return RELATIONSHIPS.includes(value as ContactRelationship)
    ? (value as ContactRelationship)
    : "Cold";
}

/** Map one GitHub scan record to a CandidateContact. */
export function fromGithubScan(raw: GithubScanContact): CandidateContact {
  return {
    name: raw.name,
    company: raw.company ?? "",
    title: raw.airtable_title ?? "",
    channels: {
      github: emptyToNull(raw.github_username) ?? emptyToNull(raw.github_url),
      email: emptyToNull(raw.email),
      linkedin: null,
      slack: null,
    },
    twitter: emptyToNull(raw.twitter),
    blog: emptyToNull(raw.blog),
    followers: raw.followers ?? 0,
    oss_overlap: raw.airtable_oss_overlap ?? "",
    last_verified: null, // the scan carries no per-contact verification date
    relationship: toRelationship(raw.airtable_relationship ?? "Cold"),
    source: `github:${raw.source_repo ?? "unknown"}`,
  };
}

export const githubScanAdapter: SourceAdapter<GithubScanContact> = {
  name: "github-scan",
  adapt: fromGithubScan,
};
