// resume.ts
// File: cli/resume.ts
// Purpose: Load + validate the human-placed, read-only structured inputs for the
//          Application Package engine (Engine 6): resume/base_resume.json →
//          BaseResume and resume/operator_profile.json → OperatorProfile.
//
// Validation is strict: on any type/shape mismatch we THROW with the exact
// offending path (e.g. "base_resume.experience[0].bullets[2]: expected string").
// We never coerce — a malformed file must stop intake, not silently degrade.

import { readFileSync } from "node:fs";
import type {
  BaseResume,
  OperatorProfile,
} from "../src/engines/application-package/types";

/** Raised when a resume/profile JSON file fails to match its target type. */
export class ResumeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeValidationError";
  }
}

// ============================================================
// Small typed assertions (path-aware)
// ============================================================

function fail(path: string, expected: string, got: unknown): never {
  throw new ResumeValidationError(
    `${path}: expected ${expected}, got ${describe(got)}`
  );
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    fail(path, "object", v);
  }
  return v as Record<string, unknown>;
}

function asString(v: unknown, path: string): string {
  if (typeof v !== "string") fail(path, "string", v);
  return v;
}

function asStringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) fail(path, "string[]", v);
  return v.map((item, i) => asString(item, `${path}[${i}]`));
}

// ============================================================
// BaseResume
// ============================================================

/** Validate an already-parsed value into a {@link BaseResume}. Pure; throws on mismatch. */
export function parseBaseResume(raw: unknown, path = "base_resume"): BaseResume {
  const o = asObject(raw, path);
  return {
    name: asString(o.name, `${path}.name`),
    summary: asString(o.summary, `${path}.summary`),
    experience: asArray(o.experience, `${path}.experience`).map((e, i) => {
      const eo = asObject(e, `${path}.experience[${i}]`);
      return {
        company: asString(eo.company, `${path}.experience[${i}].company`),
        title: asString(eo.title, `${path}.experience[${i}].title`),
        dates: asString(eo.dates, `${path}.experience[${i}].dates`),
        bullets: asStringArray(eo.bullets, `${path}.experience[${i}].bullets`),
      };
    }),
    projects: asArray(o.projects, `${path}.projects`).map((p, i) => {
      const po = asObject(p, `${path}.projects[${i}]`);
      const entry: BaseResume["projects"][number] = {
        name: asString(po.name, `${path}.projects[${i}].name`),
        description: asString(po.description, `${path}.projects[${i}].description`),
        bullets: asStringArray(po.bullets, `${path}.projects[${i}].bullets`),
        tech_tags: asStringArray(po.tech_tags, `${path}.projects[${i}].tech_tags`),
      };
      // url is the only optional field.
      if (po.url !== undefined) {
        entry.url = asString(po.url, `${path}.projects[${i}].url`);
      }
      return entry;
    }),
    education: asArray(o.education, `${path}.education`).map((ed, i) => {
      const edo = asObject(ed, `${path}.education[${i}]`);
      return {
        institution: asString(edo.institution, `${path}.education[${i}].institution`),
        degree: asString(edo.degree, `${path}.education[${i}].degree`),
        dates: asString(edo.dates, `${path}.education[${i}].dates`),
      };
    }),
    skills: asStringArray(o.skills, `${path}.skills`),
  };
}

// ============================================================
// OperatorProfile
// ============================================================

/** Validate an already-parsed value into an {@link OperatorProfile}. Pure; throws on mismatch. */
export function parseOperatorProfile(
  raw: unknown,
  path = "operator_profile"
): OperatorProfile {
  const o = asObject(raw, path);
  return {
    name: asString(o.name, `${path}.name`),
    github: asString(o.github, `${path}.github`),
    portfolio_url: asString(o.portfolio_url, `${path}.portfolio_url`),
    stack: asStringArray(o.stack, `${path}.stack`),
  };
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "array", v);
  return v;
}

// ============================================================
// File loaders (impure — read from disk, then validate)
// ============================================================

function readJSON(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new ResumeValidationError(
      `could not read ${path}: ${(err as Error).message}`
    );
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ResumeValidationError(
      `${path} is not valid JSON: ${(err as Error).message}`
    );
  }
}

/** Read + validate resume/base_resume.json. Throws {@link ResumeValidationError}. */
export function loadBaseResume(path: string): BaseResume {
  return parseBaseResume(readJSON(path), path);
}

/** Read + validate resume/operator_profile.json. Throws {@link ResumeValidationError}. */
export function loadOperatorProfile(path: string): OperatorProfile {
  return parseOperatorProfile(readJSON(path), path);
}
