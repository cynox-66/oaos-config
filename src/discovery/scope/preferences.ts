// preferences.ts
// File: src/discovery/scope/preferences.ts
// Purpose: Strict loader + writer for preferences.json — the single source of
//          truth for what automated discovery searches for.
//
// Validation is strict on READ **and** on WRITE, and it never coerces: on any
// mismatch we THROW naming the exact offending path (e.g.
// "preferences.fields[2].aspirational: ..."). Same philosophy as cli/resume.ts.
// A hand-edited file that breaks an invariant is rejected loudly, not repaired
// quietly — silently "fixing" scope would be silently inferring scope, which is
// precisely what D15 forbids.

import { readFileSync, writeFileSync } from "node:fs";
import { PREFERENCES_VERSION } from "./config";
import { ALL_SENIORITY_TERMS, SENIORITY_LEVEL_IDS } from "./seniority";
import type {
  FieldOrigin,
  Preferences,
  ScopeBaseline,
  ScopeField,
  SeniorityLevelId,
  SeniorityLevelSelection,
  SeniorityPreference,
  WorkTypeSelection,
} from "./types";

/** Raised when preferences.json fails to match the schema or an invariant. */
export class ScopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeValidationError";
  }
}

// ============================================================
// Path-aware assertions
// ============================================================

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function fail(path: string, expected: string, got: unknown): never {
  throw new ScopeValidationError(`${path}: expected ${expected}, got ${describe(got)}`);
}

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "object", v);
  return v as Record<string, unknown>;
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "array", v);
  return v;
}

function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") fail(path, "boolean", v);
  return v;
}

function asNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== "string") fail(path, "string", v);
  if (v.trim() === "") throw new ScopeValidationError(`${path}: must not be empty`);
  return v;
}

function asStringArray(v: unknown, path: string): string[] {
  return asArray(v, path).map((item, i) => asNonEmptyString(item, `${path}[${i}]`));
}

/** ISO-8601 timestamp, parseable by Date. */
function asTimestamp(v: unknown, path: string): string {
  const s = asNonEmptyString(v, path);
  if (Number.isNaN(Date.parse(s))) {
    throw new ScopeValidationError(`${path}: not a valid ISO-8601 timestamp ("${s}")`);
  }
  return s;
}

function asOrigin(v: unknown, path: string): FieldOrigin {
  if (v !== "derived" && v !== "operator_added") {
    fail(path, '"derived" or "operator_added"', v);
  }
  return v;
}

// ============================================================
// Validation (pure)
// ============================================================

function parseField(raw: unknown, path: string): ScopeField {
  const o = asObject(raw, path);
  const field: ScopeField = {
    name: asNonEmptyString(o.name, `${path}.name`),
    origin: asOrigin(o.origin, `${path}.origin`),
    evidence_backed: asBoolean(o.evidence_backed, `${path}.evidence_backed`),
    aspirational: asBoolean(o.aspirational, `${path}.aspirational`),
    enabled: asBoolean(o.enabled, `${path}.enabled`),
    supporting_evidence_ids: asStringArray(
      o.supporting_evidence_ids,
      `${path}.supporting_evidence_ids`
    ),
  };

  // Invariant: evidence_backed is true iff at least one asset backs the field.
  const backed = field.supporting_evidence_ids.length > 0;
  if (field.evidence_backed !== backed) {
    throw new ScopeValidationError(
      `${path}.evidence_backed: is ${field.evidence_backed} but supporting_evidence_ids has ` +
        `${field.supporting_evidence_ids.length} entr${backed ? "ies" : "y"} — must be ${backed}`
    );
  }

  // Invariant (D15): aspirational === operator_added AND NOT evidence_backed.
  const aspirational = field.origin === "operator_added" && !field.evidence_backed;
  if (field.aspirational !== aspirational) {
    throw new ScopeValidationError(
      `${path}.aspirational: is ${field.aspirational} but origin="${field.origin}" with ` +
        `evidence_backed=${field.evidence_backed} requires ${aspirational}`
    );
  }

  return field;
}

function parseWorkTypes(raw: unknown, path: string): WorkTypeSelection {
  const o = asObject(raw, path);
  const freelance = asBoolean(o.freelance, `${path}.freelance`);
  if (freelance !== false) {
    throw new ScopeValidationError(
      `${path}.freelance: must be false — freelance discovery is deferred by locked decision`
    );
  }
  return {
    job: asBoolean(o.job, `${path}.job`),
    internship: asBoolean(o.internship, `${path}.internship`),
    oss: asBoolean(o.oss, `${path}.oss`),
    freelance: false,
  };
}

/**
 * Validate the seniority dimension.
 *
 * Strict on three axes, each rejecting loudly rather than repairing:
 *  - the level SET must be exactly the closed config set, each id once;
 *  - every persisted term must be a MEMBER of the union of all config term
 *    lists. Membership, not per-level equality: config may gain terms without
 *    invalidating existing files, while a config REMOVAL invalidates files that
 *    persisted the removed term — deliberate, see types.ts;
 *  - no duplicate terms within a level (a sign of a hand-edit).
 */
function parseSeniority(raw: unknown, path: string): SeniorityPreference {
  const o = asObject(raw, path);
  const rawLevels = asArray(o.levels, `${path}.levels`);

  const levels: SeniorityLevelSelection[] = [];
  const seenLevels = new Map<string, number>();

  rawLevels.forEach((entry, i) => {
    const levelPath = `${path}.levels[${i}]`;
    const e = asObject(entry, levelPath);
    const id = asNonEmptyString(e.level, `${levelPath}.level`);

    if (!(SENIORITY_LEVEL_IDS as readonly string[]).includes(id)) {
      throw new ScopeValidationError(
        `${levelPath}.level: unknown seniority level "${id}" — expected one of ` +
          `${SENIORITY_LEVEL_IDS.join(", ")}`
      );
    }
    const first = seenLevels.get(id);
    if (first !== undefined) {
      throw new ScopeValidationError(
        `${levelPath}.level: duplicate level "${id}" (already at index ${first})`
      );
    }
    seenLevels.set(id, i);

    const terms = asStringArray(e.terms, `${levelPath}.terms`);
    const seenTerms = new Set<string>();
    terms.forEach((term, t) => {
      if (!ALL_SENIORITY_TERMS.includes(term)) {
        throw new ScopeValidationError(
          `${levelPath}.terms[${t}]: "${term}" is not a known seniority term. ` +
            `Terms are confirmed through \`oaos setup-scope\`, never hand-written — ` +
            `and a term removed from config invalidates files that persisted it, by design.`
        );
      }
      if (seenTerms.has(term)) {
        throw new ScopeValidationError(`${levelPath}.terms[${t}]: duplicate term "${term}"`);
      }
      seenTerms.add(term);
    });

    levels.push({
      level: id as SeniorityLevelId,
      excluded: asBoolean(e.excluded, `${levelPath}.excluded`),
      terms,
    });
  });

  const missing = SENIORITY_LEVEL_IDS.filter((id) => !seenLevels.has(id));
  if (missing.length > 0) {
    throw new ScopeValidationError(
      `${path}.levels: missing seniority level(s) ${missing.join(", ")} — ` +
        `all ${SENIORITY_LEVEL_IDS.length} levels must be present`
    );
  }

  return {
    levels,
    entry_level_query_modifier: asBoolean(
      o.entry_level_query_modifier,
      `${path}.entry_level_query_modifier`
    ),
  };
}

/** The part of the schema shared by a full read and a baseline read. */
function parseCommon(
  o: Record<string, unknown>,
  path: string
): { fields: ScopeField[]; work_types: WorkTypeSelection } {
  const fields = asArray(o.fields, `${path}.fields`).map((f, i) =>
    parseField(f, `${path}.fields[${i}]`)
  );

  const seen = new Map<string, number>();
  fields.forEach((field, i) => {
    const key = field.name.toLowerCase().trim();
    const first = seen.get(key);
    if (first !== undefined) {
      throw new ScopeValidationError(
        `${path}.fields[${i}].name: duplicate field "${field.name}" (already at index ${first})`
      );
    }
    seen.set(key, i);
  });

  return { fields, work_types: parseWorkTypes(o.work_types, `${path}.work_types`) };
}

/** The migration stop for a file written before the seniority dimension. */
function outdatedVersionError(path: string, found: number): ScopeValidationError {
  return new ScopeValidationError(
    `${path}: schema version ${found} predates the seniority dimension ` +
      `(current version is ${PREFERENCES_VERSION}).\n\n` +
      `Your file was NOT changed and NOT upgraded. Inferring a seniority preference you\n` +
      `never confirmed is exactly what D15 forbids, so this is a stop, not a migration.\n\n` +
      `Run \`oaos setup-scope\` and type 'done' to re-confirm:\n` +
      `  - your existing field ticks and work types are carried forward as the baseline\n` +
      `  - the new Seniority section is proposed with nothing excluded, so confirming\n` +
      `    without touching it reproduces your current discovery behaviour exactly`
  );
}

/**
 * Validate an unknown value as {@link Preferences}. Pure — no I/O. Throws
 * {@link ScopeValidationError} naming the offending path. Unknown extra keys are
 * ignored (the result is rebuilt field-by-field, same as cli/resume.ts).
 *
 * This is the CONSUMPTION path — strict about the version. Reading a saved file
 * merely to seed an editing baseline goes through {@link parseBaseline}, which
 * tolerates v1; see ScopeBaseline in types.ts for why the two differ.
 */
export function parsePreferences(raw: unknown, path = "preferences"): Preferences {
  const o = asObject(raw, path);

  if (o.version !== PREFERENCES_VERSION) {
    if (typeof o.version === "number" && o.version < PREFERENCES_VERSION) {
      throw outdatedVersionError(path, o.version);
    }
    throw new ScopeValidationError(
      `${path}.version: expected ${PREFERENCES_VERSION}, got ${JSON.stringify(o.version)}`
    );
  }

  const remoteOnly = asBoolean(o.remote_only, `${path}.remote_only`);
  if (remoteOnly !== true) {
    throw new ScopeValidationError(
      `${path}.remote_only: must be true — remote-only is a locked charter decision`
    );
  }

  const { fields, work_types } = parseCommon(o, path);

  return {
    version: PREFERENCES_VERSION,
    generated_at: asTimestamp(o.generated_at, `${path}.generated_at`),
    confirmed_at: asTimestamp(o.confirmed_at, `${path}.confirmed_at`),
    fields,
    work_types,
    remote_only: true,
    seniority: parseSeniority(o.seniority, `${path}.seniority`),
  };
}

/**
 * Validate an unknown value as a {@link ScopeBaseline} — a previously-saved
 * scope read ONLY to seed the interactive editing baseline.
 *
 * Version-tolerant BY DESIGN, and only here: a strict read would make
 * `oaos setup-scope` — the one command that fixes a v1 file — the one command
 * that cannot open it, and the migration message's promise to carry the
 * operator's ticks forward would be false.
 *
 * Everything else is validated with the same strict code as a full read, and
 * the result is deliberately NOT a Preferences: a tolerated v1 file still
 * cannot become a persisted scope without passing through the reducer and a
 * confirmed `buildPreferences`.
 */
export function parseBaseline(raw: unknown, path = "preferences"): ScopeBaseline {
  const o = asObject(raw, path);

  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
    throw new ScopeValidationError(
      `${path}.version: expected a schema version integer >= 1, got ${JSON.stringify(o.version)}`
    );
  }
  if (o.version > PREFERENCES_VERSION) {
    throw new ScopeValidationError(
      `${path}.version: ${o.version} is newer than this build understands ` +
        `(${PREFERENCES_VERSION}) — refusing to read it as a baseline rather than ` +
        `silently discarding settings it may carry`
    );
  }

  const { fields, work_types } = parseCommon(o, path);

  return {
    version: o.version,
    fields,
    work_types,
    // Parsed strictly when present; absent for a pre-seniority file, which is
    // the whole reason this reader exists.
    seniority: o.version >= 2 ? parseSeniority(o.seniority, `${path}.seniority`) : null,
  };
}

// ============================================================
// Disk I/O (thin; validation does the real work)
// ============================================================

/**
 * Read + validate preferences.json. Throws {@link ScopeValidationError} — with
 * the file path in the message — if it is missing, unparseable, or invalid.
 */
export function loadPreferences(path: string): Preferences {
  return parsePreferences(readJson(path), path);
}

/**
 * Read + validate a saved scope as an editing {@link ScopeBaseline}. Accepts a
 * pre-seniority (v1) file; see {@link parseBaseline}. Used ONLY by
 * `oaos setup-scope` — never by a discovery path.
 */
export function loadBaseline(path: string): ScopeBaseline {
  return parseBaseline(readJson(path), path);
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new ScopeValidationError(`could not read ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ScopeValidationError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * Validate, then write. Validation happens BEFORE the file is touched, so a
 * rejected write leaves any existing file intact.
 */
export function writePreferences(path: string, preferences: Preferences): void {
  const validated = parsePreferences(preferences, path);
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
