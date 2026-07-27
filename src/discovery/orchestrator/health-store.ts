// health-store.ts
// File: src/discovery/orchestrator/health-store.ts
// Purpose: Persistence for SourceHealthState between `oaos discover --stage3`
//          invocations. Without it the two-consecutive-failures rule can never
//          fire, because every run would start from a fresh healthy state.
//
// Posture: discovery/health.json — gitignored, operator-local, sibling of
// discovery/calendar.json and preferences.json. Machine-written (unlike
// preferences.json, which only the confirmed setup-scope path may produce),
// but reset only through `oaos discover --stage3 --reenable <name>`.
//
// STANDING INVARIANT: a corrupted health file FAILS LOUDLY, naming the path
// and the offending key. It is never silently reset — a silent reset would
// re-enable every auto-disabled source without the operator ever knowing a
// source had been failing, which inverts the entire point of the file.
// A MISSING file is not corruption: it means "no history yet", and the store
// starts empty and creates the file on flush.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HealthCheckResult, SourceHealthState, SourceHealthStatus } from "../stage3/types";
import type { HealthStore } from "./types";

export const HEALTH_PATH = "discovery/health.json";

/** Schema version of discovery/health.json. */
export const HEALTH_FILE_VERSION = 1;

export class HealthStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthStoreError";
  }
}

const STATUSES: readonly SourceHealthStatus[] = ["healthy", "probation", "auto_disabled"];

interface HealthFile {
  version: number;
  sources: Record<string, SourceHealthState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLastResult(raw: unknown, where: string): HealthCheckResult | null {
  if (raw === null) return null;
  if (!isRecord(raw)) throw new HealthStoreError(`${where}.lastResult must be an object or null`);
  if (typeof raw.ok !== "boolean") throw new HealthStoreError(`${where}.lastResult.ok must be a boolean`);
  if (typeof raw.checkedAt !== "string") throw new HealthStoreError(`${where}.lastResult.checkedAt must be a string`);
  if (typeof raw.detail !== "string") throw new HealthStoreError(`${where}.lastResult.detail must be a string`);
  return { ok: raw.ok, checkedAt: raw.checkedAt, detail: raw.detail };
}

function parseState(raw: unknown, key: string, path: string): SourceHealthState {
  const where = `${path}: sources["${key}"]`;
  if (!isRecord(raw)) throw new HealthStoreError(`${where} must be an object`);

  if (typeof raw.source !== "string" || raw.source === "") {
    throw new HealthStoreError(`${where}.source must be a non-empty string`);
  }
  if (raw.source !== key) {
    throw new HealthStoreError(`${where}.source is "${raw.source}" but its key is "${key}"`);
  }
  if (
    typeof raw.consecutiveFailures !== "number" ||
    !Number.isInteger(raw.consecutiveFailures) ||
    raw.consecutiveFailures < 0
  ) {
    throw new HealthStoreError(`${where}.consecutiveFailures must be a non-negative integer`);
  }
  if (typeof raw.status !== "string" || !STATUSES.includes(raw.status as SourceHealthStatus)) {
    throw new HealthStoreError(`${where}.status must be one of ${STATUSES.join(" | ")}`);
  }
  if (typeof raw.recoveredFromDisabled !== "boolean") {
    throw new HealthStoreError(`${where}.recoveredFromDisabled must be a boolean`);
  }

  return {
    source: raw.source,
    consecutiveFailures: raw.consecutiveFailures,
    status: raw.status as SourceHealthStatus,
    lastResult: parseLastResult(raw.lastResult ?? null, where),
    recoveredFromDisabled: raw.recoveredFromDisabled,
  };
}

/**
 * Strictly parse a health-file document. Never coerces — every violation
 * throws a {@link HealthStoreError} naming the path and the offending key.
 */
export function parseHealthFile(text: string, path: string): Map<string, SourceHealthState> {
  if (text.trim() === "") {
    throw new HealthStoreError(`${path} is empty — refusing to guess; delete it to start fresh`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new HealthStoreError(`${path} is not valid JSON: ${(err as Error).message}`);
  }

  if (!isRecord(parsed)) throw new HealthStoreError(`${path} must contain a JSON object`);
  if (parsed.version !== HEALTH_FILE_VERSION) {
    throw new HealthStoreError(`${path}: version must be ${HEALTH_FILE_VERSION}, got ${JSON.stringify(parsed.version)}`);
  }
  if (!isRecord(parsed.sources)) throw new HealthStoreError(`${path}: sources must be an object`);

  const states = new Map<string, SourceHealthState>();
  for (const key of Object.keys(parsed.sources)) {
    states.set(key, parseState((parsed.sources as Record<string, unknown>)[key], key, path));
  }
  return states;
}

/** Serialize a health map, keys sorted so diffs stay reviewable. */
export function serializeHealthFile(states: Map<string, SourceHealthState>): string {
  const sources: Record<string, SourceHealthState> = {};
  for (const key of [...states.keys()].sort()) {
    sources[key] = states.get(key) as SourceHealthState;
  }
  const doc: HealthFile = { version: HEALTH_FILE_VERSION, sources };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * In-memory {@link HealthStore}. `flush` is supplied by the caller so the
 * disk-backed and test stores share exactly one implementation of get/set/all.
 */
export function createMemoryHealthStore(
  initial: Map<string, SourceHealthState> = new Map(),
  onFlush: (states: Map<string, SourceHealthState>) => void = () => {}
): HealthStore {
  const states = new Map(initial);
  return {
    get: (name) => states.get(name),
    set: (name, state) => {
      states.set(name, state);
    },
    all: () => [...states.values()],
    flush: () => onFlush(states),
  };
}

/**
 * Disk-backed store over `discovery/health.json`. Reads (and validates) on
 * construction; a missing file starts empty and is created on the first flush.
 *
 * @throws {HealthStoreError} when the file exists but is unreadable or invalid.
 */
export function createHealthStore(path: string = HEALTH_PATH): HealthStore {
  let initial = new Map<string, SourceHealthState>();

  if (existsSync(path)) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      throw new HealthStoreError(`could not read ${path}: ${(err as Error).message}`);
    }
    initial = parseHealthFile(text, path);
  }

  return createMemoryHealthStore(initial, (states) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeHealthFile(states), "utf8");
  });
}
