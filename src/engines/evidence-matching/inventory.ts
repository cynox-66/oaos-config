// inventory.ts
// File: src/engines/evidence-matching/inventory.ts
// Purpose: Read the C4 source of truth (evidence/inventory.md) into typed
//          Evidence[]. The inventory markdown carries a single fenced ```json
//          block holding an array of Evidence objects (format documented in the
//          engine README). Parsing is pure; file reading is a thin helper.

import { readFileSync } from "fs";
import type { Evidence } from "./types";

/**
 * Extract the Evidence array from inventory markdown. Reads the first fenced
 * ```json block and parses it. Pure (no I/O).
 *
 * @throws if no json block is found or the JSON is invalid.
 */
export function parseInventory(markdown: string): Evidence[] {
  const match = markdown.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    throw new Error("inventory: no ```json block found");
  }
  const parsed = JSON.parse(match[1]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("inventory: json block is not an array");
  }
  return parsed as Evidence[];
}

/** Read and parse an inventory markdown file from disk. */
export function loadInventory(path: string): Evidence[] {
  return parseInventory(readFileSync(path, "utf8"));
}
