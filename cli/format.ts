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
