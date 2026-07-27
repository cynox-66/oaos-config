// calendar-writer.ts
// File: src/discovery/stage3/calendar-writer.ts
// Purpose: D18 calendar-sink writer. Takes CalendarEntry[] and maintains a
//          static, human-readable discovery/calendar.json — dated items
//          (program cycles, CFP windows) for Stage-1 manual intake on
//          schedule. READ BY HUMANS, not by the pipeline: nothing written
//          here is ever fed into runPipeline. Gitignored, operator-local
//          state — same posture as preferences.json (see
//          src/discovery/scope/config.ts's DEFAULT_PREFERENCES_PATH).
//
// Dedup key: CalendarEntry (Wave 2 frame, frozen) carries no id field, so
// entries are keyed by url, falling back to title when url is null/empty.
// If BOTH are missing, the entry is refused (recorded, never written)
// rather than inventing an index- or content-hash-based key, which would
// silently duplicate on reorder/edit. If proper id-keying is ever wanted,
// that is a deliberate future change to CalendarEntry itself, taken on its
// own merits — not a workaround here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CalendarEntry } from "./types";

export const CALENDAR_PATH = "discovery/calendar.json";

export interface RefusedCalendarEntry {
  entry: CalendarEntry;
  reason: string;
}

export interface CalendarWriteResult {
  written: number;
  refused: RefusedCalendarEntry[];
}

function keyFor(entry: CalendarEntry): string | null {
  if (entry.url) return entry.url;
  if (entry.title) return entry.title;
  return null;
}

function readExisting(path: string): Record<string, CalendarEntry> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return {};
  return JSON.parse(text) as Record<string, CalendarEntry>;
}

export function writeCalendarEntries(entries: CalendarEntry[], path: string = CALENDAR_PATH): CalendarWriteResult {
  const existing = readExisting(path);
  const refused: RefusedCalendarEntry[] = [];
  let written = 0;

  for (const entry of entries) {
    const key = keyFor(entry);
    if (key === null) {
      refused.push({ entry, reason: "both url and title are missing/empty — refusing to invent a key" });
      continue;
    }
    existing[key] = entry;
    written += 1;
  }

  const sorted: Record<string, CalendarEntry> = {};
  for (const key of Object.keys(existing).sort()) {
    sorted[key] = existing[key];
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");

  return { written, refused };
}
