// registry.ts
// File: src/discovery/stage3/registry.ts
// Purpose: The locked Phase 1 company_board registry (8 entries, exactly) and
//          the per-platform SourceMeta used to build Engine 11 admission
//          proposals. No live network call in this module.

import type { CompanyRegistryEntry, SourceMeta } from "./types";

// All four platforms are ingestion_method "api". Workday's classification as
// "api" (rather than "scrape") is a locked operator decision, 2026-07-20 —
// the CXS endpoint is a documented JSON API, not HTML scraping, even though
// it backs a rendered careers site.
export const COMPANY_REGISTRY: CompanyRegistryEntry[] = [
  { company: "Grafana Labs", platform: "greenhouse", token: "grafanalabs", enabled: true },
  { company: "ClickHouse", platform: "greenhouse", token: "clickhouse", enabled: true },
  { company: "Chainguard", platform: "greenhouse", token: "chainguard", enabled: true },
  { company: "Tailscale", platform: "greenhouse", token: "tailscale", enabled: true },
  { company: "Sysdig", platform: "lever", token: "sysdig", enabled: true },
  { company: "Red Hat", platform: "workday", token: "redhat", site: "Jobs", enabled: true },
  { company: "SigNoz", platform: "ashby", token: "signoz", enabled: true },
  { company: "Swirlds Labs", platform: "ashby", token: "hashgraph", enabled: true },
];

// est_volume_per_week: conservative NEW-postings-per-week estimates, not
// steady-state board totals (research counts: grafanalabs 114, clickhouse 173,
// chainguard 80, tailscale 38, sysdig 5, redhat 228, signoz 12, hashgraph 2).
export const PLATFORM_SOURCE_META: Record<string, SourceMeta> = {
  greenhouse: {
    name: "greenhouse",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 30,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
  lever: {
    name: "lever",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 2,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
  workday: {
    name: "workday",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 20,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
  ashby: {
    name: "ashby",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 3,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
  },
};
