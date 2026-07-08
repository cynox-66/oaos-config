// commands/discover.ts
// File: cli/commands/discover.ts
// Purpose: `oaos discover` — Stage 2 transport. Reads raw alert emails
//          (.eml/.txt) dropped in a watched folder, parses each into RawItems
//          via the Stage 2 parsers, runs every listing through the same intake
//          pipeline as `oaos intake`, persists it, and moves the file to
//          processed/ so a re-run never reprocesses it.
//
// The core `runDiscover(deps)` takes an injected filesystem + item processor so
// its file-move / detection / decision logic is unit-testable with no real
// Airtable, Gemini, or disk. The thin `runDiscoverCommand` wires the real
// implementations.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { normalize } from "../../src/engines/normalization";
import type { RawItem } from "../../src/engines/normalization/types";
import { runPipeline } from "../../src/pipeline";
import { createPersistence } from "../../src/persistence";
import { loadInventory } from "../../src/engines/evidence-matching/inventory";
import { createGeminiClient } from "../../src/engines/scoring/gemini";
import { detectSource, parseAlertEmail } from "../../src/discovery/stage2";
import type { AlertSource } from "../../src/discovery/stage2";
import { getFlag, hasFlag } from "../args";
import { formatDiscoverSummary, type DiscoverFileResult } from "../format";

/** Default watched folder (repo root). */
export const DEFAULT_DIR = "discovery-inbox";

const ALERT_EXTS = new Set([".eml", ".txt"]);

/** Whether a filename is a watched alert file (.eml / .txt). Pure. */
export function isAlertFile(name: string): boolean {
  return ALERT_EXTS.has(extname(name).toLowerCase());
}

/** The processed/ subfolder of a watched folder. Pure. */
export function processedDir(dir: string): string {
  return join(dir, "processed");
}

// ============================================================
// Injectable dependencies (mocked in tests)
// ============================================================

/** Minimal filesystem surface `runDiscover` needs — injected for testability. */
export interface DiscoverFs {
  /** Top-level `.eml`/`.txt` basenames in `dir` (empty if `dir` is absent). */
  listAlertFiles(dir: string): string[];
  read(path: string): string;
  move(from: string, to: string): void;
  ensureDir(dir: string): void;
}

/** Process one parsed listing → persisted opportunity. Returns write outcome. */
export type ProcessItem = (item: RawItem) => Promise<{ ok: boolean; errors: string[] }>;

export interface DiscoverDeps {
  dir: string;
  dryRun: boolean;
  fs: DiscoverFs;
  detect: (raw: string) => AlertSource | null;
  parse: (raw: string) => RawItem[];
  processItem: ProcessItem;
}

// ============================================================
// Core (pure logic, injected side effects)
// ============================================================

/**
 * Process every alert file in `deps.dir` and return a per-file outcome list.
 *
 * Decision table:
 *  - unrecognized source (`detect` → null) → leave in place, status
 *    "unrecognized";
 *  - dry run → parse + report only, never write or move, status "previewed";
 *  - a listing that throws while processing (e.g. Gemini 429) → leave in place
 *    for retry, status "error" (stops that file; remaining listings retried on
 *    re-run — persistence is fingerprint-idempotent);
 *  - recognized + processed (0 listings and non-fatal write errors are OK) →
 *    move to processed/, status "moved".
 *
 * Never throws; failures become "error" outcomes.
 */
export async function runDiscover(deps: DiscoverDeps): Promise<DiscoverFileResult[]> {
  const { dir, dryRun, fs, detect, parse, processItem } = deps;
  const dest = processedDir(dir);
  const results: DiscoverFileResult[] = [];

  for (const file of fs.listAlertFiles(dir).sort()) {
    const path = join(dir, file);
    const raw = fs.read(path);
    const source = detect(raw);

    if (source === null) {
      results.push({ file, source: null, listings: 0, written: 0, errors: [], status: "unrecognized" });
      continue;
    }

    const items = parse(raw);

    if (dryRun) {
      results.push({ file, source, listings: items.length, written: 0, errors: [], status: "previewed" });
      continue;
    }

    let written = 0;
    const errors: string[] = [];
    let fatal = false;
    for (const item of items) {
      try {
        const r = await processItem(item);
        if (r.ok) written++;
        errors.push(...r.errors);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        fatal = true;
        break; // a transport failure will hit the rest too — stop, leave for retry
      }
    }

    if (fatal) {
      results.push({ file, source, listings: items.length, written, errors, status: "error" });
      continue; // leave in place
    }

    fs.ensureDir(dest);
    fs.move(path, join(dest, file));
    results.push({ file, source, listings: items.length, written, errors, status: "moved" });
  }

  return results;
}

// ============================================================
// Real implementations
// ============================================================

/** Node filesystem implementation of {@link DiscoverFs}. */
function nodeFs(): DiscoverFs {
  return {
    listAlertFiles(dir) {
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && isAlertFile(e.name))
        .map((e) => e.name);
    },
    read: (path) => readFileSync(path, "utf8"),
    move: (from, to) => renameSync(from, to),
    ensureDir: (dir) => {
      mkdirSync(dir, { recursive: true });
    },
  };
}

/**
 * Build the real per-listing processor: normalize → runPipeline (real Gemini) →
 * persist (real Airtable). Inventory / clients are built once and shared across
 * all listings in the run.
 */
function makeProcessItem(): ProcessItem {
  const inventory = loadInventory(resolve(process.cwd(), "evidence/inventory.md"));
  const gemini_client = createGeminiClient();
  const persistence = createPersistence();

  return async (item) => {
    const opportunity = normalize(item);
    const result = await runPipeline(item, {
      inventory,
      contacts_input: { opportunity, githubScan: [], manual: [] },
      gemini_client,
    });
    const writes = await persistence.writePipelineResult(result);
    const opp = writes[0];
    return {
      ok: Boolean(opp?.success),
      errors: writes.filter((w) => !w.success).map((w) => w.error ?? "unknown write error"),
    };
  };
}

// ============================================================
// Command
// ============================================================

/**
 * Run `oaos discover [--dir <path>] [--dry-run]`. Parses watched-folder alerts,
 * runs each listing through the intake pipeline + persistence, moves processed
 * files, and prints a summary. `--dry-run` parses and reports without writing to
 * Airtable or moving files (and needs no Gemini/Airtable credentials).
 */
export async function runDiscoverCommand(args: string[]): Promise<void> {
  const dir = resolve(process.cwd(), getFlag(args, "--dir") ?? DEFAULT_DIR);
  const dryRun = hasFlag(args, "--dry-run");

  const files = await runDiscover({
    dir,
    dryRun,
    fs: nodeFs(),
    detect: detectSource,
    parse: parseAlertEmail,
    // In a dry run the processor is never invoked; skip building real clients so
    // no credentials are required just to preview.
    processItem: dryRun ? async () => ({ ok: false, errors: [] }) : makeProcessItem(),
  });

  console.log(formatDiscoverSummary({ dir, dryRun, files }));
}
