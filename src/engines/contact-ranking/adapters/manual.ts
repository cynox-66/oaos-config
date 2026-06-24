// adapters/manual.ts
// File: src/engines/contact-ranking/adapters/manual.ts
// Purpose: Adapt a hand-entered contact (manual LinkedIn / CNCF Slack / public
//          team page) into the unified CandidateContact, filling defaults.

import type { CandidateContact, ManualContactInput, SourceAdapter } from "../types";

/** Map one hand-entered contact to a CandidateContact. */
export function fromManual(raw: ManualContactInput): CandidateContact {
  return {
    name: raw.name,
    company: raw.company,
    title: raw.title ?? "",
    channels: {
      github: raw.github ?? null,
      email: raw.email ?? null,
      linkedin: raw.linkedin ?? null,
      slack: raw.slack ?? null,
    },
    twitter: raw.twitter ?? null,
    blog: raw.blog ?? null,
    followers: raw.followers ?? 0,
    oss_overlap: raw.oss_overlap ?? "",
    last_verified: raw.last_verified ?? null,
    relationship: raw.relationship ?? "Cold",
    source: "manual",
  };
}

export const manualAdapter: SourceAdapter<ManualContactInput> = {
  name: "manual",
  adapt: fromManual,
};
