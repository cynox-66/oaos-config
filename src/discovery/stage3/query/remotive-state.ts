// remotive-state.ts
// File: src/discovery/stage3/query/remotive-state.ts
// Purpose: The Remotive structural constraint — a HARD cap of one API call per
//          day, enforced by persisted state rather than by convention.
//
// ── Why ─────────────────────────────────────────────────────────────────────
// Remotive documents an etiquette of "a few calls per day" and ships a legal
// notice in every response body. A source that merely INTENDS to be polite
// breaks the moment someone runs `oaos discover --stage3 --source remotive`
// twice while debugging. This file makes a second same-day call structurally
// impossible: the adapter checks state BEFORE constructing a request, so the
// refusal happens with zero bytes on the wire.
//
// ── Posture ─────────────────────────────────────────────────────────────────
// discovery/remotive.json — gitignored, operator-local, sibling of health.json
// and calendar.json. Same failure posture as the health store, for the same
// reason: a corrupt file THROWS naming the path and the offending key, and is
// never silently reset. A silent reset here would hand back a fresh daily
// budget on every corrupt read, which is precisely the cap this file exists to
// enforce. A MISSING file is not corruption — it means "never called".
//
// ── Why healthCheck reads this instead of probing ───────────────────────────
// The orchestrator calls fetch() and then healthCheck() on every run. If
// healthCheck made its own request, Remotive would burn TWO calls per run and
// the cap would be a lie. So the last fetch's outcome is RECORDED here, and
// healthCheck reports the record. Remotive's healthCheck never performs I/O.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const REMOTIVE_STATE_PATH = "discovery/remotive.json";

/** Schema version of discovery/remotive.json. */
export const REMOTIVE_STATE_VERSION = 1;

export class RemotiveStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemotiveStateError";
  }
}

export interface RemotiveState {
  /** UTC calendar day of the last call, "YYYY-MM-DD". Null when never called. */
  lastCallDate: string | null;
  /** Full ISO-8601 instant of the last call. Null when never called. */
  lastCallAt: string | null;
  /** Outcome of the last call, replayed by healthCheck without any I/O. */
  lastOk: boolean | null;
  /** Human-readable outcome detail, surfaced verbatim in the weekly report. */
  lastDetail: string | null;
}

/**
 * The store the adapter depends on. Injected, so every test runs disk-free —
 * the same pattern as the orchestrator's HealthStore.
 */
export interface RemotiveStateStore {
  read(): RemotiveState;
  write(state: RemotiveState): void;
}

export function emptyState(): RemotiveState {
  return { lastCallDate: null, lastCallAt: null, lastOk: null, lastDetail: null };
}

/** UTC calendar day of an ISO-8601 instant. The cap is a UTC-day cap. */
export function utcDay(isoInstant: string): string {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) {
    throw new RemotiveStateError(`not a valid ISO-8601 instant: ${JSON.stringify(isoInstant)}`);
  }
  return date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(raw: unknown, where: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new RemotiveStateError(`${where} must be a string or null`);
  return raw;
}

/** Strictly parse the state document. Never coerces — every violation throws. */
export function parseRemotiveState(text: string, path: string): RemotiveState {
  if (text.trim() === "") {
    throw new RemotiveStateError(`${path} is empty — refusing to guess; delete it to start fresh`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new RemotiveStateError(`${path} is not valid JSON: ${(err as Error).message}`);
  }

  if (!isRecord(parsed)) throw new RemotiveStateError(`${path} must contain a JSON object`);
  if (parsed.version !== REMOTIVE_STATE_VERSION) {
    throw new RemotiveStateError(
      `${path}: version must be ${REMOTIVE_STATE_VERSION}, got ${JSON.stringify(parsed.version)}`
    );
  }

  const lastCallDate = nullableString(parsed.lastCallDate, `${path}: lastCallDate`);
  if (lastCallDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(lastCallDate)) {
    throw new RemotiveStateError(`${path}: lastCallDate must be "YYYY-MM-DD", got ${JSON.stringify(lastCallDate)}`);
  }
  if (parsed.lastOk !== null && parsed.lastOk !== undefined && typeof parsed.lastOk !== "boolean") {
    throw new RemotiveStateError(`${path}: lastOk must be a boolean or null`);
  }

  return {
    lastCallDate,
    lastCallAt: nullableString(parsed.lastCallAt, `${path}: lastCallAt`),
    lastOk: (parsed.lastOk ?? null) as boolean | null,
    lastDetail: nullableString(parsed.lastDetail, `${path}: lastDetail`),
  };
}

export function serializeRemotiveState(state: RemotiveState): string {
  return `${JSON.stringify({ version: REMOTIVE_STATE_VERSION, ...state }, null, 2)}\n`;
}

/** In-memory store for tests. */
export function createMemoryRemotiveStore(
  initial: RemotiveState = emptyState(),
  onWrite: (state: RemotiveState) => void = () => {}
): RemotiveStateStore {
  let current = { ...initial };
  return {
    read: () => ({ ...current }),
    write: (state) => {
      current = { ...state };
      onWrite(current);
    },
  };
}

/**
 * Disk-backed store over `discovery/remotive.json`.
 *
 * @throws {RemotiveStateError} when the file exists but is unreadable or invalid.
 */
export function createRemotiveStore(path: string = REMOTIVE_STATE_PATH): RemotiveStateStore {
  return {
    read: () => {
      if (!existsSync(path)) return emptyState();
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch (err) {
        throw new RemotiveStateError(`could not read ${path}: ${(err as Error).message}`);
      }
      return parseRemotiveState(text, path);
    },
    write: (state) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serializeRemotiveState(state), "utf8");
    },
  };
}
