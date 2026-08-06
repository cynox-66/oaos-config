// config.ts
// File: src/discovery/scope/config.ts
// Purpose: Static configuration for the Discovery Scope module. Pure exported
//          data only — nothing here is read implicitly; callers import and pass.

import { DOMAIN_KEYWORDS } from "../../engines/normalization/config";

/**
 * The searchable field taxonomy — Engine 1's controlled domain vocabulary,
 * imported read-only so discovery scope and scoring stay aligned on ONE
 * vocabulary (D15). Never duplicate this list.
 *
 * `DOMAIN_KEYWORDS` is keyed by `Exclude<Domain, "Other">`, so "Other" is
 * excluded by construction — it is a normalization catch-all, not a searchable
 * field.
 */
export const SCOPE_VOCABULARY: readonly string[] = Object.keys(DOMAIN_KEYWORDS);

/**
 * Schema version of preferences.json. Bumping requires a migration path.
 *
 * v1 → v2 added the seniority dimension. v2 → v3 added geo eligibility and
 * the role_types schema. An older file is REJECTED with an actionable
 * message, never silently upgraded or defaulted: inferring a preference the
 * operator never confirmed is exactly what D15 forbids. See preferences.ts
 * `parsePreferences` / `parseBaseline`.
 */
export const PREFERENCES_VERSION = 3 as const;

/** Default on-disk location, relative to the repo root. */
export const DEFAULT_PREFERENCES_PATH = "preferences.json";

/**
 * Work types proposed for a fresh derivation. `freelance` is the locked `false`
 * literal (deferred by decision); the other three are the Phase 1 scope.
 */
export const PROPOSED_WORK_TYPES = {
  job: true,
  internship: true,
  oss: true,
  freelance: false,
} as const;
