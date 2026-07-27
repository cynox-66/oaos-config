// health-store.test.ts
// File: src/discovery/orchestrator/tests/health-store.test.ts
// Purpose: discovery/health.json round-trip + the loud-failure invariant. A
//          corrupted health file must NEVER silently reset — that would
//          re-enable every auto-disabled source without the operator knowing.

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHealthStore,
  createMemoryHealthStore,
  HealthStoreError,
  HEALTH_FILE_VERSION,
  parseHealthFile,
  serializeHealthFile,
} from "../health-store";
import { advanceHealth, createHealthState } from "../../stage3/health";
import type { SourceHealthState } from "../../stage3/types";

const tmpDirs: string[] = [];

function tmpPath(name = "health.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "oaos-health-"));
  tmpDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (tmpDirs.length > 0) rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
});

const healthy: SourceHealthState = {
  source: "nlnet",
  consecutiveFailures: 0,
  status: "healthy",
  lastResult: { ok: true, checkedAt: "2026-07-28T00:00:00.000Z", detail: "ok, 12 entries" },
  recoveredFromDisabled: false,
};

describe("health store — fresh file", () => {
  it("starts empty when the file is absent and creates it on flush", () => {
    const path = tmpPath();
    expect(existsSync(path)).toBe(false);

    const store = createHealthStore(path);
    expect(store.all()).toEqual([]);

    store.set("nlnet", healthy);
    store.flush();

    expect(existsSync(path)).toBe(true);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    expect(doc.version).toBe(HEALTH_FILE_VERSION);
    expect(doc.sources.nlnet.status).toBe("healthy");
  });

  it("creates the parent directory when it does not exist", () => {
    const path = join(tmpPath("x.json"), "..", "nested", "health.json");
    const store = createHealthStore(path);
    store.set("nlnet", healthy);
    store.flush();
    expect(existsSync(path)).toBe(true);
  });
});

describe("health store — round-trip", () => {
  it("preserves every field across write and re-read", () => {
    const path = tmpPath();
    const disabled = advanceHealth(
      advanceHealth(createHealthState("greenhouse"), { ok: false, checkedAt: "t1", detail: "boom" }),
      { ok: false, checkedAt: "t2", detail: "boom again" }
    );

    const first = createHealthStore(path);
    first.set("nlnet", healthy);
    first.set("greenhouse", disabled);
    first.flush();

    const second = createHealthStore(path);
    expect(second.get("nlnet")).toEqual(healthy);
    expect(second.get("greenhouse")).toEqual(disabled);
    expect(second.get("greenhouse")?.status).toBe("auto_disabled");
  });

  it("serializes source keys in sorted order", () => {
    const states = new Map<string, SourceHealthState>([
      ["zeta", { ...healthy, source: "zeta" }],
      ["alpha", { ...healthy, source: "alpha" }],
    ]);
    expect(Object.keys(JSON.parse(serializeHealthFile(states)).sources)).toEqual(["alpha", "zeta"]);
  });

  it("round-trips a null lastResult", () => {
    const path = tmpPath();
    const store = createHealthStore(path);
    store.set("esoc", createHealthState("esoc"));
    store.flush();
    expect(createHealthStore(path).get("esoc")?.lastResult).toBeNull();
  });
});

describe("health store — malformed files fail loudly", () => {
  const cases: [string, string, RegExp][] = [
    ["not JSON", "{ nope", /not valid JSON/],
    ["empty", "   ", /is empty/],
    ["not an object", "[]", /must contain a JSON object/],
    ["wrong version", JSON.stringify({ version: 99, sources: {} }), /version must be 1/],
    ["missing sources", JSON.stringify({ version: 1 }), /sources must be an object/],
    [
      "bad status",
      JSON.stringify({
        version: 1,
        sources: { a: { source: "a", consecutiveFailures: 0, status: "nope", lastResult: null, recoveredFromDisabled: false } },
      }),
      /status must be one of/,
    ],
    [
      "negative failures",
      JSON.stringify({
        version: 1,
        sources: { a: { source: "a", consecutiveFailures: -1, status: "healthy", lastResult: null, recoveredFromDisabled: false } },
      }),
      /consecutiveFailures must be a non-negative integer/,
    ],
    [
      "key/source mismatch",
      JSON.stringify({
        version: 1,
        sources: { a: { source: "b", consecutiveFailures: 0, status: "healthy", lastResult: null, recoveredFromDisabled: false } },
      }),
      /is "b" but its key is "a"/,
    ],
    [
      "bad lastResult",
      JSON.stringify({
        version: 1,
        sources: { a: { source: "a", consecutiveFailures: 0, status: "healthy", lastResult: { ok: "yes" }, recoveredFromDisabled: false } },
      }),
      /lastResult\.ok must be a boolean/,
    ],
    [
      "missing recoveredFromDisabled",
      JSON.stringify({
        version: 1,
        sources: { a: { source: "a", consecutiveFailures: 0, status: "healthy", lastResult: null } },
      }),
      /recoveredFromDisabled must be a boolean/,
    ],
  ];

  it.each(cases)("rejects %s, naming the path", (_label, text, pattern) => {
    const path = tmpPath();
    writeFileSync(path, text, "utf8");
    expect(() => createHealthStore(path)).toThrow(HealthStoreError);
    expect(() => createHealthStore(path)).toThrow(pattern);
    // The path is always named so the operator knows which file to fix.
    expect(() => createHealthStore(path)).toThrow(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("never silently resets — a corrupt file throws instead of returning an empty store", () => {
    const path = tmpPath();
    writeFileSync(path, "{ corrupt", "utf8");
    let store: unknown = "unset";
    try {
      store = createHealthStore(path);
    } catch {
      store = "threw";
    }
    expect(store).toBe("threw");
  });

  it("parseHealthFile is the strict primitive used by the store", () => {
    expect(() => parseHealthFile("{}", "/p/health.json")).toThrow(/version must be 1/);
  });
});

describe("memory health store", () => {
  it("does not mutate the map it was seeded with", () => {
    const initial = new Map<string, SourceHealthState>([["nlnet", healthy]]);
    const store = createMemoryHealthStore(initial);
    store.set("esoc", createHealthState("esoc"));
    expect(initial.size).toBe(1);
    expect(store.all()).toHaveLength(2);
  });

  it("calls onFlush with the current states", () => {
    let seen: string[] = [];
    const store = createMemoryHealthStore(new Map(), (states) => {
      seen = [...states.keys()];
    });
    store.set("nlnet", healthy);
    store.flush();
    expect(seen).toEqual(["nlnet"]);
  });
});
