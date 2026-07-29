// http-json.ts
// File: src/discovery/stage3/query/http-json.ts
// Purpose: One GET-and-parse-JSON helper shared by the query_net sources, so
//          all five classify transport failures identically. Takes SourceDeps
//          injected like everything else in this tree — imports no HTTP client.
//
// Error kinds, applied consistently:
//   http  — the request threw, or returned a non-200 status.
//   parse — the body is not valid JSON.
//   shape — the body parsed but is not the documented structure.
// (`SourceErrorKind` has exactly these three members; Wave 5 did not extend it.)

import type { SourceDeps, SourceError } from "../types";

export type JsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: SourceError };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GET `url` and JSON-parse the body. Never throws — failure is a result. */
export async function getJson(url: string, scope: string, deps: SourceDeps): Promise<JsonResult> {
  let response;
  try {
    response = await deps.httpGet(url);
  } catch (err) {
    return { ok: false, error: { scope, kind: "http", detail: message(err) } };
  }

  if (response.status !== 200) {
    return { ok: false, error: { scope, kind: "http", detail: `unexpected status ${response.status}` } };
  }

  try {
    return { ok: true, data: JSON.parse(response.body) };
  } catch (err) {
    return { ok: false, error: { scope, kind: "parse", detail: `invalid JSON: ${message(err)}` } };
  }
}

/** True for a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read an array from `key` of a parsed body, or return a `shape` error naming
 * what was found instead. An ABSENT key is treated as an empty array only when
 * `absentIsEmpty` is set — some APIs omit the array entirely on zero results.
 */
export function readArray(
  data: unknown,
  key: string,
  scope: string,
  absentIsEmpty = false
): { ok: true; items: unknown[] } | { ok: false; error: SourceError } {
  if (!isRecord(data)) {
    return { ok: false, error: { scope, kind: "shape", detail: `expected a JSON object, got ${typeof data}` } };
  }
  const value = data[key];
  if (value === undefined && absentIsEmpty) return { ok: true, items: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: { scope, kind: "shape", detail: `expected "${key}" to be an array, got ${typeof value}` } };
  }
  return { ok: true, items: value };
}

/** Read a trimmed non-empty string from a record, else null. */
export function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
