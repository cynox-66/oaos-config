// meta-wave5.ts
// File: src/discovery/stage3/sources/meta-wave5.ts
// Purpose: SourceMeta for the five Wave 5 query_net sources, used to build
//          Engine 11 admission proposals via buildSourceProposal. Same
//          convention as registry.ts's PLATFORM_SOURCE_META (Wave 3) and
//          meta.ts (Wave 4). No live network call in this module.
//
// ── Why maintenance is 2-3 min/week, higher than Wave 4's flat 2 ────────────
// A query_net source has a dependency Wave 3/4 sources do not: it constructs
// requests from the operator's confirmed scope. When the scope changes, the
// queries change, and their yield has to be sanity-checked. adzuna and
// remotive sit at 2 because neither can drift much — Adzuna's queries are
// mechanical (term + " remote") and Remotive takes no query at all.
//
// ── Running admission budget ────────────────────────────────────────────────
//   Wave 3 company boards  4 x 2 = 8
//   Wave 4 OSS/calendar             11
//   Wave 5 query_net                13   (this file)
//   ─────────────────────────────────────
//   TOTAL                           32 of the 50 min/week global budget,
//                                   18 remaining.
//
// est_volume_per_week reflects what reaches the PIPELINE after this source's
// own within-run dedupe — not raw API result counts, and not post-prerank
// survivors (prerank's 25-slot budget is a run-level concern, not a per-source
// property).

import type { SourceMeta } from "../types";

export const WAVE5_SOURCE_META: Record<string, SourceMeta> = {
  himalayas: {
    name: "himalayas",
    ingestion_method: "api",
    auth_required: false,
    // 13 queries x a fixed top ~20 per query, heavily overlapping after dedupe.
    est_volume_per_week: 120,
    est_maint_min_per_week: 3,
    cost_per_month_inr: 0,
  },
  freehire: {
    name: "freehire",
    ingestion_method: "api",
    auth_required: false,
    est_volume_per_week: 120,
    est_maint_min_per_week: 3,
    cost_per_month_inr: 0,
    justification:
      "Content-quarantined (Wave 5): descriptions are silently capped at ~1000 chars (min 956 / median 995 / max 1002 across 100 sampled, no truncation marker), so this source is a discovery/dedup signal and never a content source.",
  },
  adzuna: {
    name: "adzuna",
    ingestion_method: "api",
    auth_required: true,
    // Tight India+remote queries measured 0-11 results each, live.
    est_volume_per_week: 30,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
    justification:
      "Content-quarantined (Wave 5): every description is truncated to exactly 500 chars mid-sentence, so this source is a discovery/dedup signal only — acting on an item requires opening redirect_url. Free tier; auth_required is an app id/key, not a paid plan.",
  },
  remotive: {
    name: "remotive",
    ingestion_method: "api",
    auth_required: false,
    // One call a day, ~36 jobs per call, before run-level dedupe.
    est_volume_per_week: 250,
    est_maint_min_per_week: 2,
    cost_per_month_inr: 0,
    justification:
      "Hard-capped at 1 API call per UTC day in code (persisted state, refusal happens before a request is built) to honour Remotive's documented 'few calls per day' etiquette.",
  },
  "hn-hiring": {
    name: "hn-hiring",
    ingestion_method: "api",
    auth_required: false,
    // Monthly thread: ~276 comments, ~34 survive the scope prefilter, and the
    // same thread is re-read (and deduped away) on subsequent runs.
    est_volume_per_week: 10,
    est_maint_min_per_week: 3,
    cost_per_month_inr: 0,
    justification:
      "Community-convention source, not an API contract: the 'Company | Role | Location' first-line format is directional, not rigid. A lexical scope prefilter runs before any parse so unmatched comments never reach the pipeline's Gemini budget.",
  },
};
