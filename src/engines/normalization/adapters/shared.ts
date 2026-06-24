// adapters/shared.ts
// File: src/engines/normalization/adapters/shared.ts
// Purpose: Helpers shared by source adapters — payload field reading and
//          best-effort remote/work-arrangement detection. Pure functions.

import type { Remote } from "../types";

/** A loosely-typed payload object. */
export type PayloadObject = Record<string, unknown>;

/** Read the first present, non-empty string value among candidate keys. */
export function readString(
  payload: PayloadObject,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Detect work arrangement from free text; defaults to "unknown". */
export function detectRemote(text: string): Remote {
  const s = text.toLowerCase();
  if (/\bhybrid\b/.test(s)) return "hybrid";
  if (/\bremote\b|\bwork\s+from\s+home\b|\bwfh\b|\bfully\s+remote\b/.test(s)) {
    return "remote";
  }
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b|\bin[\s-]?person\b/.test(s)) {
    return "onsite";
  }
  return "unknown";
}

/** Extract a labeled value from pasted free text, e.g. "Company: Acme". */
export function readLabeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, "im");
    const m = text.match(re);
    if (m && m[1].trim() !== "") return m[1].trim();
  }
  return null;
}
