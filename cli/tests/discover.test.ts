// tests/discover.test.ts
// Unit tests for `oaos discover` pure logic: the file-move / detection /
// decision core (runDiscover) driven by a fake filesystem + fake processor,
// the alert-file filter, and the summary formatter. No real fs, Airtable, or
// Gemini.

import { describe, it, expect } from "vitest";
import { basename, join } from "node:path";
import {
  runDiscover,
  isAlertFile,
  processedDir,
  DEFAULT_DIR,
  type DiscoverFs,
  type DiscoverDeps,
} from "../commands/discover";
import { formatDiscoverSummary, type DiscoverFileResult } from "../format";
import type { RawItem } from "../../src/engines/normalization/types";
import type { AlertSource } from "../../src/discovery/stage2";

const DIR = "inbox";

/** In-memory fake filesystem that records moves and ensured dirs. */
function fakeFs(files: Record<string, string>) {
  const moved: Array<{ from: string; to: string }> = [];
  const ensured: string[] = [];
  const remaining = { ...files };
  const fs: DiscoverFs = {
    listAlertFiles: () => Object.keys(remaining),
    read: (path) => remaining[basename(path)] ?? "",
    move: (from, to) => {
      moved.push({ from, to });
      delete remaining[basename(from)];
    },
    ensureDir: (dir) => {
      ensured.push(dir);
    },
  };
  return { fs, moved, ensured, remaining };
}

function deps(over: Partial<DiscoverDeps> & { fs: DiscoverFs }): DiscoverDeps {
  return {
    dir: DIR,
    dryRun: false,
    detect: () => "linkedin",
    parse: () => [{} as RawItem],
    processItem: async () => ({ ok: true, errors: [] }),
    ...over,
  };
}

const rawItems = (n: number): RawItem[] => Array.from({ length: n }, () => ({}) as RawItem);

// ============================================================
// isAlertFile
// ============================================================

describe("isAlertFile", () => {
  it("accepts .eml and .txt (any case), rejects others", () => {
    expect(isAlertFile("a.eml")).toBe(true);
    expect(isAlertFile("b.TXT")).toBe(true);
    expect(isAlertFile("c.html")).toBe(false);
    expect(isAlertFile("d")).toBe(false);
    expect(isAlertFile(".gitkeep")).toBe(false);
  });
});

describe("processedDir / DEFAULT_DIR", () => {
  it("nests processed/ under the watched dir", () => {
    expect(processedDir("inbox")).toBe(join("inbox", "processed"));
  });
  it("defaults to discovery-inbox", () => {
    expect(DEFAULT_DIR).toBe("discovery-inbox");
  });
});

// ============================================================
// runDiscover — decision table
// ============================================================

describe("runDiscover", () => {
  it("recognized + processed → writes listings and moves the file", async () => {
    const { fs, moved, ensured, remaining } = fakeFs({ "linkedin.eml": "raw" });
    const [r] = await runDiscover(
      deps({ fs, detect: () => "linkedin", parse: () => rawItems(3) })
    );
    expect(r.status).toBe("moved");
    expect(r.listings).toBe(3);
    expect(r.written).toBe(3);
    expect(moved).toEqual([{ from: join(DIR, "linkedin.eml"), to: join(DIR, "processed", "linkedin.eml") }]);
    expect(ensured).toContain(join(DIR, "processed"));
    expect(remaining).not.toHaveProperty("linkedin.eml"); // won't be reprocessed
  });

  it("unrecognized source → left in place, flagged, not moved", async () => {
    const { fs, moved } = fakeFs({ "mystery.txt": "raw" });
    const [r] = await runDiscover(deps({ fs, detect: () => null }));
    expect(r.status).toBe("unrecognized");
    expect(r.source).toBeNull();
    expect(moved).toEqual([]);
  });

  it("a listing that throws → status error, file left for retry (not moved)", async () => {
    const { fs, moved } = fakeFs({ "indeed.eml": "raw" });
    const [r] = await runDiscover(
      deps({
        fs,
        detect: () => "indeed",
        parse: () => rawItems(2),
        processItem: async () => {
          throw new Error("Gemini 429");
        },
      })
    );
    expect(r.status).toBe("error");
    expect(r.errors[0]).toContain("429");
    expect(moved).toEqual([]);
  });

  it("dry run → parses + reports, never writes or moves", async () => {
    const processItem = async () => {
      throw new Error("should not be called in dry run");
    };
    const { fs, moved } = fakeFs({ "upwork.eml": "raw" });
    const [r] = await runDiscover(
      deps({ fs, dryRun: true, detect: () => "upwork", parse: () => rawItems(4), processItem })
    );
    expect(r.status).toBe("previewed");
    expect(r.listings).toBe(4);
    expect(r.written).toBe(0);
    expect(moved).toEqual([]);
  });

  it("recognized but zero listings → still moved (processed, nothing to write)", async () => {
    const { fs, moved } = fakeFs({ "empty.eml": "raw" });
    const [r] = await runDiscover(deps({ fs, detect: () => "remoteok", parse: () => [] }));
    expect(r.status).toBe("moved");
    expect(r.listings).toBe(0);
    expect(r.written).toBe(0);
    expect(moved).toHaveLength(1);
  });

  it("non-fatal write errors do not block the move", async () => {
    const { fs, moved } = fakeFs({ "wellfound.eml": "raw" });
    const [r] = await runDiscover(
      deps({
        fs,
        detect: () => "wellfound",
        parse: () => rawItems(2),
        processItem: async () => ({ ok: false, errors: ["Airtable 422"] }),
      })
    );
    expect(r.status).toBe("moved");
    expect(r.written).toBe(0);
    expect(r.errors).toEqual(["Airtable 422", "Airtable 422"]);
    expect(moved).toHaveLength(1);
  });

  it("processes multiple files in one run, sorted, mixing outcomes", async () => {
    const { fs, moved } = fakeFs({ "b.eml": "b", "a.txt": "a" });
    const results = await runDiscover(
      deps({
        fs,
        detect: (raw) => (raw === "a" ? null : "linkedin"),
        parse: () => rawItems(1),
      })
    );
    expect(results.map((r) => r.file)).toEqual(["a.txt", "b.eml"]); // sorted
    expect(results[0].status).toBe("unrecognized");
    expect(results[1].status).toBe("moved");
    expect(moved).toHaveLength(1);
  });
});

// ============================================================
// formatDiscoverSummary
// ============================================================

describe("formatDiscoverSummary", () => {
  const files: DiscoverFileResult[] = [
    { file: "linkedin.eml", source: "linkedin", listings: 2, written: 2, errors: [], status: "moved" },
    { file: "mystery.txt", source: null, listings: 0, written: 0, errors: [], status: "unrecognized" },
    { file: "indeed.eml", source: "indeed", listings: 3, written: 1, errors: ["x"], status: "error" },
  ];

  it("renders per-file lines and correct totals", () => {
    const out = formatDiscoverSummary({ dir: "discovery-inbox", dryRun: false, files });
    expect(out).toContain("oaos discover — discovery-inbox");
    expect(out).toContain("[linkedin]");
    expect(out).toContain("[unknown]");
    expect(out).toContain("✓ moved");
    expect(out).toContain("⚠ unrecognized");
    expect(out).toContain("⚠ error");
    // 3 files · 2 recognized · 5 listings · 3 written · 1 unrecognized · 1 errors
    expect(out).toContain("3 files · 2 recognized · 5 listings · 3 written · 1 unrecognized · 1 errors");
  });

  it("marks a dry run in the header", () => {
    const out = formatDiscoverSummary({ dir: "x", dryRun: true, files: [] });
    expect(out).toContain("oaos discover (dry-run)");
  });
});
