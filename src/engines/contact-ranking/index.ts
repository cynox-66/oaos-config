// index.ts
// File: src/engines/contact-ranking/index.ts
// Purpose: Public surface of the Contact Discovery & Ranking Engine (Engine 5).

export {
  rankContacts,
  computeReachability,
  computeRoleRelevance,
  computeSeniority,
} from "./rank";
export {
  dedupeCandidates,
  normalizeName,
  normalizeCompany,
  firstName,
  githubHandle,
  linkedinHandle,
} from "./dedupe";
export { fromGithubScan, githubScanAdapter, fromManual, manualAdapter } from "./adapters";

export type {
  Contact,
  RankedContacts,
  DiscoveryRequest,
  RankOptions,
  Seniority,
  Channels,
  CandidateContact,
  GithubScanContact,
  ManualContactInput,
  SourceAdapter,
} from "./types";
