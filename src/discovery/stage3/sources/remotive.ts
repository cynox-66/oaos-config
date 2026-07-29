// remotive.ts
// File: src/discovery/stage3/sources/remotive.ts
// Purpose: Remotive query_net source — ONE call per UTC day, hard-capped in
//          code. The only Wave 5 source that takes no query input at all.
//
// ── Live-confirmed API shape (2026-07-28) ───────────────────────────────────
//   GET https://remotive.com/api/remote-jobs?category=software-dev
//   → 200 {00-warning, 0-legal-notice, job-count, total-job-count, jobs[]}
//   36 jobs. Descriptions are FULL (25 KB first row, 60 KB max) — real content,
//   no quarantine needed. This is the only truncation-free query_net source
//   besides Himalayas.
//
// ── WHY THIS SOURCE IS NOT SCOPE-DRIVEN ─────────────────────────────────────
// It has no free-text query param. The only lever is `category`, and in this
// wave's single permitted probe `category=software-dev` DID NOT FILTER: the 36
// returned rows spanned Sales (6), Product Management (5), Medical (2),
// Marketing (2), Writing (2), Customer Service (2) and more, with only 10
// actually Software Development. Phase 0c (2026-07-19) recorded the filter
// working; either the accepted slug changed or the filter regressed.
//
// Operator ruling: send the param anyway, do not rely on it, do not spend a
// second call investigating. It costs nothing and the source self-heals if the
// filter comes back. 36 items is small enough that sorting them is prerank's
// job regardless. `limit` is likewise ignored by the API (also recorded in
// Phase 0c) and is therefore not sent.
//
// So this source's test asserts scope-INDEPENDENCE: a different enabled-field
// set must produce the identical request. Faking a scope dependency here would
// be dishonest about what the API can actually do.
//
// ── THE ONE-CALL-A-DAY CAP (structural constraint) ──────────────────────────
// Remotive documents "a few calls per day" and ships a legal notice in every
// response. The cap is enforced BEFORE a request is constructed, against
// persisted state (query/remotive-state.ts) — so a second same-day run is
// refused with zero bytes on the wire, not merely discouraged.
//
// healthCheck NEVER performs I/O. It replays the outcome recorded by the last
// fetch. If it probed instead, the source would burn two calls per run and the
// cap would be a lie.
//
// Note on the refusal's SourceError: `SourceErrorKind` is exactly
// "http" | "parse" | "shape" and Wave 5 did not extend it (the one authorized
// frame touch was the family union). "http" is the least-wrong of the three
// for a transport-layer refusal, and the detail says plainly that nothing was
// sent. This is a known wart, recorded rather than smoothed over. It costs
// nothing operationally: health comes from healthCheck, never from fetch
// errors, so a refusal cannot push this source toward auto_disabled.

import type { RawItem } from "../../../engines/normalization/types";
import type { FetchResult, HealthCheckResult, SourceDeps, SourceError, Stage3Source } from "../types";
import { getJson, isRecord, readArray, str } from "../query/http-json";
import type { RemotiveStateStore } from "../query/remotive-state";
import { utcDay } from "../query/remotive-state";

export interface RemotiveConfig {
  baseUrl: string;
  /** Sent but NOT relied on — see the header note. */
  category: string;
}

export const REMOTIVE_CONFIG: RemotiveConfig = {
  baseUrl: "https://remotive.com/api/remote-jobs",
  category: "software-dev",
};

const SOURCE_NAME = "remotive";

export function remotiveUrl(config: RemotiveConfig): string {
  return `${config.baseUrl}?category=${encodeURIComponent(config.category)}`;
}

function toRawItem(raw: Record<string, unknown>, deps: SourceDeps): RawItem {
  // No quarantine: descriptions here are full text.
  return {
    source_type: "job_board",
    source_name: SOURCE_NAME,
    raw_payload: raw,
    url: str(raw, "url"),
    fetched_at: deps.now(),
  };
}

async function callRemotive(
  config: RemotiveConfig,
  deps: SourceDeps
): Promise<{ items: RawItem[]; errors: SourceError[] }> {
  const scope = SOURCE_NAME;
  const response = await getJson(remotiveUrl(config), scope, deps);
  if (!response.ok) return { items: [], errors: [response.error] };

  const rows = readArray(response.data, "jobs", scope, true);
  if (!rows.ok) return { items: [], errors: [rows.error] };

  const items: RawItem[] = [];
  const errors: SourceError[] = [];

  for (const raw of rows.items) {
    if (!isRecord(raw)) {
      errors.push({ scope, kind: "shape", detail: `expected a job object, got ${typeof raw}` });
      continue;
    }
    items.push(toRawItem(raw, deps));
  }

  return { items, errors };
}

async function fetchRemotive(
  config: RemotiveConfig,
  store: RemotiveStateStore,
  deps: SourceDeps
): Promise<FetchResult> {
  const now = deps.now();
  const today = utcDay(now);
  const state = store.read();

  // THE CAP. Checked before any URL is built — the refusal costs zero requests.
  if (state.lastCallDate === today) {
    return {
      items: [],
      errors: [
        {
          scope: SOURCE_NAME,
          kind: "http",
          detail:
            `refused locally, nothing was sent: Remotive is capped at 1 call per UTC day and ` +
            `today's call already happened at ${state.lastCallAt ?? "an unrecorded time"}. ` +
            `Next call available ${today}T24:00Z.`,
        },
      ],
    };
  }

  const result = await callRemotive(config, deps);
  const ok = result.errors.length === 0;

  store.write({
    lastCallDate: today,
    lastCallAt: now,
    lastOk: ok,
    lastDetail: ok
      ? `ok, ${result.items.length} jobs`
      : `failed: ${result.errors.map((e) => e.detail).join("; ")}`,
  });

  return { items: result.items, errors: result.errors };
}

/**
 * The Remotive source.
 *
 * @param store persisted daily-cap state. Injected, so tests are disk-free.
 */
export function createRemotiveSource(
  config: RemotiveConfig = REMOTIVE_CONFIG,
  store?: RemotiveStateStore
): Stage3Source {
  if (!store) {
    throw new Error("remotive needs a RemotiveStateStore — the 1-call-per-day cap cannot be enforced without it.");
  }

  return {
    name: SOURCE_NAME,
    family: "query_net",
    enabled: true,
    fetch: (deps) => fetchRemotive(config, store, deps),

    // ZERO I/O. Replays the last recorded fetch outcome — see the header note.
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const state = store.read();
      if (state.lastOk === null) {
        return {
          ok: true,
          checkedAt: deps.now(),
          detail: "no call recorded yet — the daily budget is unspent",
        };
      }
      return {
        ok: state.lastOk,
        checkedAt: deps.now(),
        detail: `last call ${state.lastCallAt ?? "?"}: ${state.lastDetail ?? "no detail recorded"}`,
      };
    },
  };
}
