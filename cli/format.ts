// format.ts
// File: cli/format.ts
// Purpose: Pure output formatting for the OAOS CLI. Every function takes plain
//          data and returns a string — no I/O, no engine imports — so the whole
//          module is trivially unit-testable (F6).

// ============================================================
// intake
// ============================================================

export interface IntakeSummary {
  company: string;
  role: string;
  category: string;
  tier: string;
  total: number;
  action: string;
  contactCount: number;
  /** Airtable record id written, or null if the write failed. */
  recordId: string | null;
  /** Write errors, if any (empty on full success). */
  errors: string[];
}

/** Render the post-intake summary block. */
export function formatIntakeSummary(s: IntakeSummary): string {
  const lines = [
    "",
    "── Intake complete ─────────────────────────────",
    `  ${s.company} — ${s.role}`,
    `  Category : ${s.category}`,
    `  Score    : ${s.total}/100  (Tier ${s.tier})`,
    `  Action   : ${s.action}`,
    `  Contacts : ${s.contactCount}`,
  ];
  if (s.recordId) {
    lines.push(`  Written  : ${s.recordId}`);
  } else {
    lines.push(`  Written  : FAILED`);
  }
  for (const e of s.errors) lines.push(`  ! ${e}`);
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}

// ============================================================
// intake — application-package flag block (#12a)
// ============================================================

export interface PackageFlags {
  /** Hard-flagged sentences (nets 1/2/3/5) still present after regeneration. */
  hard: string[];
  /** Review-only sentences (net-4-only; regeneration did NOT fire for these). */
  reviewOnly: string[];
  /** True when the semantic (Layer 2) audit could not run. */
  semanticDegraded: boolean;
}

/**
 * Render the fabrication-flag block shown before the operator acknowledgment
 * gate. Hard flags and review-only flags are visually distinct; the semantic-
 * degradation state renders INSIDE this same block (never buried) so the
 * operator sees "the AI check failed AND there are review flags" together.
 * Returns "" when there is nothing to show.
 */
export function formatPackageFlags(f: PackageFlags): string {
  if (f.hard.length === 0 && f.reviewOnly.length === 0 && !f.semanticDegraded) return "";
  const lines = ["", "── Application-package flags ───────────────────"];
  if (f.hard.length > 0) {
    lines.push("  ⚠ HARD fabrication flags (regeneration already fired; still present):");
    f.hard.forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
  }
  if (f.reviewOnly.length > 0) {
    if (f.hard.length > 0) lines.push("");
    lines.push(
      "  REVIEW-ONLY flags (token rule — did NOT trigger regeneration):",
      "  Vocabulary not lexically traceable to the base resume/evidence.",
      "  Verify each sentence is true before submitting:"
    );
    f.reviewOnly.forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
  }
  if (f.semanticDegraded) {
    lines.push(
      "",
      "  ! SEMANTIC AUDIT DEGRADED — the AI fact-check (net 5) did not run.",
      "    Flags above reflect hard rules only; review with extra care."
    );
  }
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}

// ============================================================
// score --company (F4)
// ============================================================

export interface ScoreChange {
  company: string;
  usingFirstMatch: boolean;
  oldQuality: number | null;
  newQuality: number;
  oldMatch: number | null;
  newMatch: number;
  oldTotal: number | null;
  newTotal: number;
  oldTier: string | null;
  newTier: string;
}

const showNum = (n: number | null): string => (n === null ? "—" : String(n));
const showStr = (s: string | null): string => (s === null || s === "" ? "—" : s);

/** Render the before/after of a re-score. */
export function formatScoreChange(c: ScoreChange): string {
  const lines = ["", `── Re-scored: ${c.company} ──────────────────────`];
  if (c.usingFirstMatch) {
    lines.push(`  (Using first match for ${c.company})`);
  }
  lines.push(
    `  Quality : ${showNum(c.oldQuality)} → ${c.newQuality}`,
    `  Match   : ${showNum(c.oldMatch)} → ${c.newMatch}`,
    `  Total   : ${showNum(c.oldTotal)} → ${c.newTotal}`,
    `  Tier    : ${showStr(c.oldTier)} → ${c.newTier}`,
    "  (Quality Score + Match Score patched; Total/Tier recompute in Airtable)",
    "────────────────────────────────────────────────"
  );
  return lines.join("\n");
}

// ============================================================
// contacts (F3)
// ============================================================

export interface ContactsImport {
  file: string;
  total: number;
  created: number;
  failed: number;
  errors: string[];
}

/** Render the contact-import summary. */
export function formatContactsImport(r: ContactsImport): string {
  const lines = [
    "",
    "── Contact import ──────────────────────────────",
    `  Source  : ${r.file}`,
    `  Records : ${r.total}`,
    `  Created : ${r.created}`,
    `  Failed  : ${r.failed}`,
  ];
  for (const e of r.errors.slice(0, 10)) lines.push(`  ! ${e}`);
  if (r.errors.length > 10) lines.push(`  … and ${r.errors.length - 10} more`);
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}

// ============================================================
// report (F5)
// ============================================================

export interface ReportRow {
  company: string;
  role: string;
  total: number | null;
  tier: string;
  source: string;
}

export interface Report {
  discoveredThisWeek: number;
  sentThisWeek: number;
  /** All-time count of replied outreach. */
  responsesAllTime: number;
  followUpsDueToday: number;
  topUnactioned: ReportRow[];
}

/** Render the weekly report (F5 definitions). */
export function formatReport(r: Report): string {
  const lines = [
    "",
    "── OAOS weekly report ──────────────────────────",
    `  Discovered this week   : ${r.discoveredThisWeek}`,
    `  Sent this week         : ${r.sentThisWeek}`,
    `  Responses (all time)   : ${r.responsesAllTime}`,
    `  Follow-ups due today   : ${r.followUpsDueToday}`,
    "",
    "  Top unactioned S/A:",
  ];
  if (r.topUnactioned.length === 0) {
    lines.push("    (none)");
  } else {
    r.topUnactioned.forEach((row, i) => {
      lines.push(
        `    ${i + 1}. [${row.tier}] ${showNum(row.total)}  ${row.company} — ${row.role}  (${showStr(
          row.source
        )})`
      );
    });
  }
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}

// ============================================================
// discover (Stage 2 transport)
// ============================================================

/** Per-file outcome of an `oaos discover` run. */
export interface DiscoverFileResult {
  file: string;
  /** Detected AlertSource, or null when the source was unrecognized. */
  source: string | null;
  listings: number;
  written: number;
  /** Non-fatal write errors (file was still moved). */
  errors: string[];
  status: "moved" | "unrecognized" | "error" | "previewed";
}

export interface DiscoverSummary {
  dir: string;
  dryRun: boolean;
  files: DiscoverFileResult[];
}

/** Render the post-`discover` summary block. Pure. */
export function formatDiscoverSummary(s: DiscoverSummary): string {
  const header = s.dryRun
    ? `oaos discover (dry-run) — ${s.dir}`
    : `oaos discover — ${s.dir}`;
  const lines = ["", header];

  let recognized = 0;
  let listings = 0;
  let written = 0;
  let unrecognized = 0;
  let errored = 0;

  for (const f of s.files) {
    listings += f.listings;
    written += f.written;
    if (f.source === null) unrecognized++;
    else recognized++;
    if (f.status === "error") errored++;

    const tag = f.source ? `[${f.source}]` : "[unknown]";
    const mark =
      f.status === "moved"
        ? "✓ moved"
        : f.status === "previewed"
          ? "· preview"
          : f.status === "unrecognized"
            ? "⚠ unrecognized — review"
            : "⚠ error — left for retry";
    const detail =
      f.source === null
        ? "—"
        : `${f.listings} listing${f.listings === 1 ? "" : "s"} → ${f.written} written` +
          (f.errors.length ? ` (${f.errors.length} err)` : "");

    lines.push(`  ${f.file.padEnd(28)} ${tag.padEnd(10)} ${detail.padEnd(30)} ${mark}`);
  }

  lines.push(
    `Totals: ${s.files.length} files · ${recognized} recognized · ${listings} listings · ` +
      `${written} written · ${unrecognized} unrecognized · ${errored} errors`
  );
  return lines.join("\n");
}
