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
import type { FieldOrigin, Preferences, ScopeField, WorkTypeSelection } from "./types";

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
 * Validate an unknown value as {@link Preferences}. Pure — no I/O. Throws
 * {@link ScopeValidationError} naming the offending path. Unknown extra keys are
 * ignored (the result is rebuilt field-by-field, same as cli/resume.ts).
 */
export function parsePreferences(raw: unknown, path = "preferences"): Preferences {
  const o = asObject(raw, path);

  if (o.version !== PREFERENCES_VERSION) {
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

  return {
    version: PREFERENCES_VERSION,
    generated_at: asTimestamp(o.generated_at, `${path}.generated_at`),
    confirmed_at: asTimestamp(o.confirmed_at, `${path}.confirmed_at`),
    fields,
    work_types: parseWorkTypes(o.work_types, `${path}.work_types`),
    remote_only: true,
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
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new ScopeValidationError(`could not read ${path}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ScopeValidationError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  return parsePreferences(parsed, path);
}

/**
 * Validate, then write. Validation happens BEFORE the file is touched, so a
 * rejected write leaves any existing file intact.
 */
export function writePreferences(path: string, preferences: Preferences): void {
  const validated = parsePreferences(preferences, path);
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
