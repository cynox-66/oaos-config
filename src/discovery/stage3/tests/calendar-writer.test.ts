// calendar-writer.test.ts
// File: src/discovery/stage3/tests/calendar-writer.test.ts

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCalendarEntries } from "../calendar-writer";
import type { CalendarEntry } from "../types";

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oaos-calendar-test-"));
  filePath = join(dir, "nested", "calendar.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const entryA: CalendarEntry = {
  title: "Outreachy May 2026 call",
  date: "2026-02-06T16:00:00-08:00",
  url: "https://www.outreachy.org/blog/may-2026-call/",
  description: null,
};

const entryB: CalendarEntry = {
  title: "NLnet grant round",
  date: "2026-06-16T00:00:00Z",
  url: "https://nlnet.nl/news/2026/round.html",
  description: "67 new projects",
};

describe("writeCalendarEntries", () => {
  it("creates a fresh file (and its directory) with valid, pretty-printed JSON", () => {
    const result = writeCalendarEntries([entryA], filePath);
    expect(result.written).toBe(1);
    expect(result.refused).toEqual([]);
    expect(existsSync(filePath)).toBe(true);

    const text = readFileSync(filePath, "utf8");
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("\n"); // pretty-printed, not minified
    const parsed = JSON.parse(text);
    expect(parsed[entryA.url as string]).toEqual(entryA);
  });

  it("re-run with the same entries does not duplicate", () => {
    writeCalendarEntries([entryA], filePath);
    writeCalendarEntries([entryA], filePath);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(Object.keys(parsed)).toHaveLength(1);
  });

  it("re-run with an updated entry updates it in place", () => {
    writeCalendarEntries([entryA], filePath);
    const updated: CalendarEntry = { ...entryA, description: "now confirmed" };
    writeCalendarEntries([updated], filePath);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(Object.keys(parsed)).toHaveLength(1);
    expect(parsed[entryA.url as string].description).toBe("now confirmed");
  });

  it("unrelated existing entries are preserved across a re-run", () => {
    writeCalendarEntries([entryA], filePath);
    writeCalendarEntries([entryB], filePath);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(Object.keys(parsed)).toHaveLength(2);
    expect(parsed[entryA.url as string]).toEqual(entryA);
    expect(parsed[entryB.url as string]).toEqual(entryB);
  });

  it("keys are stable-sorted (deterministic key order across runs)", () => {
    writeCalendarEntries([entryB, entryA], filePath);
    const text = readFileSync(filePath, "utf8");
    const keys = Object.keys(JSON.parse(text));
    expect(keys).toEqual([...keys].sort());
  });

  it("falls back to title as the key when url is null", () => {
    const noUrl: CalendarEntry = { title: "Only a title", date: null, url: null, description: null };
    const result = writeCalendarEntries([noUrl], filePath);
    expect(result.written).toBe(1);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(parsed["Only a title"]).toEqual(noUrl);
  });

  it("refuses an entry with both url and title missing/empty, never inventing a key", () => {
    const unkeyable: CalendarEntry = { title: "", date: null, url: null, description: null };
    const result = writeCalendarEntries([unkeyable], filePath);
    expect(result.written).toBe(0);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0].entry).toEqual(unkeyable);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(Object.keys(parsed)).toHaveLength(0);
  });
});
