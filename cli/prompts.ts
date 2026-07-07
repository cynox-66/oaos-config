// prompts.ts
// File: cli/prompts.ts
// Purpose: Input layer for the OAOS CLI. Splits cleanly into:
//   - PURE helpers (validators + RawItem construction) — unit-tested, no I/O;
//   - an IMPURE readline prompter — a thin wrapper over node:readline/promises,
//     exercised only by live commands (not unit-tested; see F6).

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { RawItem, SourceType } from "../src/engines/normalization/types";

// ============================================================
// Pure — validation
// ============================================================

/** Result of validating a single free-text answer. `value === null` with a null
 *  `error` means "empty / skipped" (allowed for optional prompts). */
export interface Validated<T> {
  value: T | null;
  error: string | null;
}

/**
 * Validate an optional URL. Empty input is allowed (returns null/null). A
 * non-empty value must be a well-formed http(s) URL, otherwise an error is
 * returned. Trims surrounding whitespace.
 */
export function validateURL(input: string): Validated<string> {
  const trimmed = input.trim();
  if (trimmed === "") return { value: null, error: null };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { value: null, error: `Not a valid URL: "${trimmed}"` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { value: null, error: `URL must be http(s): "${trimmed}"` };
  }
  return { value: trimmed, error: null };
}

/**
 * Validate a minimum-contributions count (github-contributor-scan arg). Must be
 * a positive integer. Empty input is rejected (the caller supplies a default).
 */
export function validateMinContributions(input: string): Validated<number> {
  const trimmed = input.trim();
  if (trimmed === "") return { value: null, error: "A value is required" };
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: `Not a whole number: "${trimmed}"` };
  }
  const n = Number(trimmed);
  if (n < 1) return { value: null, error: "Must be at least 1" };
  return { value: n, error: null };
}

/**
 * Resolve a numbered menu choice (1-based) to its option value. Returns null for
 * blank, non-numeric, or out-of-range input so callers can apply a default.
 */
export function parseChoice<T>(
  input: string,
  options: readonly { label: string; value: T }[]
): T | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const idx = Number(trimmed) - 1;
  if (idx < 0 || idx >= options.length) return null;
  return options[idx].value;
}

// ============================================================
// Pure — RawItem construction
// ============================================================

/** The operator-entered fields the CLI collects for a manual opportunity. */
export interface ManualEntry {
  company: string;
  role: string;
  description: string;
  comp: string | null;
  location: string | null;
  remote: string | null;
  url: string | null;
  /** Chosen Category (F2) — passed through to the manual adapter as-is. */
  category: string;
  /** Chosen SourceType (F1). */
  source_type: SourceType;
}

/**
 * Build a canonical {@link RawItem} for a manual intake. `source_name` is always
 * "manual" (routes to the manual adapter). The chosen `category` rides inside
 * the structured `raw_payload` so the adapter can assert it directly (F2). Pure.
 *
 * @param entry the collected fields.
 * @param fetched_at ISO-8601 timestamp for `fetched_at`.
 */
export function buildManualRawItem(entry: ManualEntry, fetched_at: string): RawItem {
  return {
    source_type: entry.source_type,
    source_name: "manual",
    raw_payload: {
      company: entry.company,
      role: entry.role,
      description: entry.description,
      comp: entry.comp,
      location: entry.location,
      remote: entry.remote,
      category: entry.category,
    },
    url: entry.url,
    fetched_at,
  };
}

// ============================================================
// Impure — interactive prompter (not unit-tested; F6)
// ============================================================

/** A minimal line-reader over stdin/stdout. Call {@link Prompter.close} when done. */
export interface Prompter {
  /** Ask a question and resolve with the raw (untrimmed) answer. */
  ask(question: string): Promise<string>;
  /** Repeatedly ask until `validate` accepts; prints the error and retries. */
  askValidated<T>(question: string, validate: (s: string) => Validated<T>): Promise<T | null>;
  close(): void;
}

/** Create an interactive prompter backed by node:readline/promises. */
export function createPrompter(): Prompter {
  const rl = createInterface({ input, output });
  return {
    ask(question: string): Promise<string> {
      return rl.question(question);
    },
    async askValidated<T>(
      question: string,
      validate: (s: string) => Validated<T>
    ): Promise<T | null> {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const answer = await rl.question(question);
        const { value, error } = validate(answer);
        if (error === null) return value;
        output.write(`  ! ${error}\n`);
      }
    },
    close(): void {
      rl.close();
    },
  };
}
