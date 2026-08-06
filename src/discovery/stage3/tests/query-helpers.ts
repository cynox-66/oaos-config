// query-helpers.ts
// File: src/discovery/stage3/tests/query-helpers.ts
// Purpose: Shared fakes for the Wave 5 query_net source tests. Not a test file
//          (no *.test.* in the name), so vitest does not collect it.

import { SENIORITY_LEVELS } from "../../scope/seniority";
import type { Preferences, ScopeField, SeniorityPreference } from "../../scope/types";
import type { SourceDeps } from "../types";

export const NOW = "2026-07-28T12:00:00.000Z";

function field(name: string, enabled: boolean): ScopeField {
  return {
    name,
    // "derived", not "vocabulary": FieldOrigin has only "derived" |
    // "operator_added". The old literal was invalid and survived because the
    // repo has no tsconfig.json and vitest transpiles without typechecking
    // (docs/known-issues.md #24).
    origin: "derived",
    evidence_backed: true,
    aspirational: false,
    enabled,
    supporting_evidence_ids: ["C4-1"],
  };
}

/** Every level present, nothing excluded — the shape a fresh confirmation makes. */
export function seniorityFixture(
  excluded: string[] = [],
  entry_level_query_modifier = false
): SeniorityPreference {
  return {
    levels: SENIORITY_LEVELS.map((level) => ({
      level: level.id,
      excluded: excluded.includes(level.id),
      terms: [...level.terms],
    })),
    entry_level_query_modifier,
  };
}

/**
 * A confirmed scope fixture. Built here rather than read from the operator's
 * real preferences.json — tests must be disk-free, and D15 means no session
 * ever produces that file.
 */
export function preferencesFixture(
  enabled: string[],
  disabled: string[] = [],
  seniority: SeniorityPreference = seniorityFixture()
): Preferences {
  return {
    version: 3,
    generated_at: "2026-07-27T00:00:00.000Z",
    confirmed_at: "2026-07-27T00:00:00.000Z",
    fields: [...enabled.map((n) => field(n, true)), ...disabled.map((n) => field(n, false))],
    work_types: { job: true, internship: true, oss: true, freelance: false },
    remote_only: true,
    seniority,
    geo: null,
    role_types: [],
  };
}

export interface RecordingDeps extends SourceDeps {
  /** Every URL passed to httpGet, in call order. */
  requests: string[];
}

/**
 * SourceDeps that records every request and answers from a URL→response map.
 * An unmatched URL yields 404, so a test that expects a request it never
 * stubbed fails loudly instead of silently seeing an empty result.
 */
export function recordingDeps(
  responder: (url: string) => { status: number; body: string } | undefined
): RecordingDeps {
  const requests: string[] = [];
  return {
    requests,
    now: () => NOW,
    httpPost: async () => ({ status: 405, body: "" }),
    httpGet: async (url: string) => {
      requests.push(url);
      return responder(url) ?? { status: 404, body: "not found" };
    },
  };
}

/** Always answers with one body and status, recording every URL. */
export function fixedDeps(body: string, status = 200): RecordingDeps {
  return recordingDeps(() => ({ status, body }));
}
