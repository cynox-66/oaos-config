// meta.ts
// File: src/discovery/stage3/sources/meta.ts
// Purpose: SourceMeta for the six Wave 4 sources, used to build Engine 11
//          admission proposals via buildSourceProposal. Same convention as
//          registry.ts's PLATFORM_SOURCE_META (Wave 3). No live network
//          call in this module.
//
// est_volume_per_week for cncf-lfx/lfdt is 0: both are calendar-tracked —
// they never produce RawItems, so they add zero opportunity volume (and
// zero dedupe/scoring load) to the pipeline. est_volume_per_week for ghsl
// is 0 too, but for a different reason: the feed mechanism is verified
// real, but currently carries no entries (see sources/ghsl.ts) — honest
// accounting of the CURRENT state, not a broken source.

import type { SourceMeta } from "../types";

export const WAVE4_SOURCE_META: Record<string, SourceMeta> = {
  esoc: {
    name: "esoc",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 1,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
  "cncf-lfx": {
    name: "cncf-lfx",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 0,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
    justification: "Calendar-tracked only (D18) — GitHub-hosted project_ideas.md is verified empty; real data lives on the external LFX platform, out of scope this wave.",
  },
  lfdt: {
    name: "lfdt",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 0,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
    justification: "Calendar-tracked only (D18) — real project table lives in file content the github_repo frame cannot reach; routed to a human reminder instead of parsed RawItems.",
  },
  nlnet: {
    name: "nlnet",
    ingestion_method: "rss",
    auth_required: false,
    est_volume_per_week: 3,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
  outreachy: {
    name: "outreachy",
    ingestion_method: "rss",
    auth_required: false,
    est_volume_per_week: 0,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
    justification: "Calendar-tracked only (D18) — nothing from this source enters the opportunity pipeline by design.",
  },
  ghsl: {
    name: "ghsl",
    ingestion_method: "rss",
    auth_required: false,
    est_volume_per_week: 0,
    est_maint_min_per_week: 1,
    cost_per_month_inr: 0,
    justification: "Verified-mechanism, dormant-content source (2026-07-21): valid Atom feed, currently zero entries. Near-zero cost to sit idle; flows automatically once GitHub Security Lab publishes.",
  },
};
