// index.ts
// File: src/discovery/stage3/index.ts
// Purpose: Public surface of the Stage-3 source-family core.

export { createHealthState, advanceHealth } from "./health";
export { MAX_CONSECUTIVE_FAILURES } from "./config";
export { createCompanyBoardSource, SourceFetchError } from "./company-board";
export { buildContentsApiUrl, buildAuthHeader, parseContentsResponse, createGitHubRepoSource } from "./github-repo";
export { parseAtomFeed, mapFeedEntriesToCalendar, createAtomFeedSource } from "./atom-feed";
export { buildSourceProposal } from "./admission";

export type {
  Stage3Source,
  StageSourceFamily,
  SourceDeps,
  HttpResponse,
  FetchResult,
  SourceError,
  SourceErrorKind,
  HealthCheckResult,
  SourceHealthState,
  SourceHealthStatus,
  CompanyRegistryEntry,
  CompanyBoardAdapter,
  RepoSourceConfig,
  ContentsApiEntry,
  RepoAdapter,
  FeedSourceConfig,
  FeedEntry,
  CalendarEntry,
  FeedPipelineAdapter,
  SourceMeta,
} from "./types";
