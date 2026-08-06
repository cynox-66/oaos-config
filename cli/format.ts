// format.ts
// File: cli/format.ts
// Purpose: Pure output formatting for the OAOS CLI. Every function takes plain
//          data and returns a string — no I/O, no engine imports — so the whole
//          module is trivially unit-testable (F6).
//
// The one import below is TYPE-ONLY (erased at runtime), so this module stays
// dependency-free while the Stage-3 run summary it renders cannot silently
// drift from the orchestrator's own shape.

import type { Stage3RunSummary } from "../src/discovery/orchestrator/types";
import type { LlmCallStats } from "../src/llm/types";

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

/** One Stage-3 source's persisted health, as surfaced in the weekly report. */
export interface SourceHealthRow {
  name: string;
  status: "healthy" | "probation" | "auto_disabled";
  consecutiveFailures: number;
  /** The last check's detail, carried VERBATIM from the source. */
  detail: string;
  /** ISO-8601 of the last check, or null when never checked. */
  checkedAt: string | null;
  /** Recovered from auto_disabled and awaiting an explicit `--reenable`. */
  recovered: boolean;
}

export interface Report {
  discoveredThisWeek: number;
  sentThisWeek: number;
  /** All-time count of replied outreach. */
  responsesAllTime: number;
  followUpsDueToday: number;
  topUnactioned: ReportRow[];
  /**
   * Stage-3 source health from discovery/health.json. Omitted (not empty)
   * when no health file exists yet — a Stage-3 run has never happened.
   */
  sourceHealth?: SourceHealthRow[];
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

  if (r.sourceHealth !== undefined) {
    lines.push("", "  Stage-3 source health:");
    if (r.sourceHealth.length === 0) {
      lines.push("    (no source has been checked yet)");
    } else {
      const disabled = r.sourceHealth.filter((s) => s.status === "auto_disabled");
      const recovered = r.sourceHealth.filter((s) => s.recovered);

      for (const s of r.sourceHealth) {
        const mark =
          s.status === "healthy" ? "✓" : s.status === "probation" ? "!" : "✗";
        const fails = s.consecutiveFailures > 0 ? ` (${s.consecutiveFailures} consecutive)` : "";
        lines.push(`    ${mark} ${s.name.padEnd(14)} ${s.status}${fails}`);
        lines.push(`        ${s.detail}`);
      }

      if (disabled.length > 0) {
        lines.push(
          "",
          `  ⚠ AUTO-DISABLED (${disabled.length}): ${disabled.map((s) => s.name).join(", ")}`,
          "    These sources are skipped by discovery. Fall back to Stage-1 manual",
          "    intake for them, then re-enable with:",
          "      oaos discover --stage3 --reenable <name>"
        );
      }
      if (recovered.length > 0) {
        lines.push(
          "",
          `  ↻ RECOVERED (${recovered.length}): ${recovered.map((s) => s.name).join(", ")}`,
          "    A clean check succeeded, but recovery never resumes a source by",
          "    itself. Re-enable explicitly with:",
          "      oaos discover --stage3 --reenable <name>"
        );
      }
    }
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

// ============================================================
// discover --stage3 (Wave 6 orchestration)
// ============================================================

/**
 * Render one Stage-3 run summary. This is the operator-facing artifact of the
 * whole wave — it must answer, at a glance: what ran, what it cost, what got
 * through the gate, what broke, and what needs a decision.
 */
export function formatStage3Summary(s: Stage3RunSummary): string {
  const header = s.dryRun
    ? `oaos discover --stage3 (dry-run — nothing persisted) — ${s.runTimestamp}`
    : `oaos discover --stage3 — ${s.runTimestamp}`;
  const lines = ["", header, ""];

  const ran = s.sources.filter((x) => x.status === "ran");
  const skipped = s.sources.filter((x) => x.status !== "ran");

  if (ran.length === 0) {
    lines.push("  (no source ran)");
  } else {
    lines.push(
      "  source          fetched  cal  dedup  passed  gated  written  health",
      "  ─────────────────────────────────────────────────────────────────────"
    );
    for (const x of ran) {
      const health = x.health
        ? x.health.status === "healthy"
          ? "✓ healthy"
          : x.health.status === "probation"
            ? `! probation (${x.health.consecutiveFailures})`
            : "✗ auto-disabled"
        : "—";
      lines.push(
        `  ${x.name.padEnd(14)} ${String(x.fetched).padStart(7)}  ${String(x.calendarRouted).padStart(3)}  ` +
          `${String(x.deduped).padStart(5)}  ${String(x.prerankPassed).padStart(6)}  ` +
          `${String(x.prerankGated).padStart(5)}  ${String(x.written).padStart(7)}  ${health}`
      );
    }
  }

  for (const x of skipped) {
    const why =
      x.status === "skipped_disabled"
        ? "skipped — disabled in the source table"
        : x.status === "skipped_auto_disabled"
          ? `skipped — AUTO-DISABLED${x.health?.recovered ? " (recovered this run — needs --reenable)" : ""}`
          : "skipped — build error";
    lines.push(`  ${x.name.padEnd(14)} ${why}`);
  }

  if (s.geo != null) {
    const unresolvedNote =
      s.geo.unresolvedPolicy === "pass"
        ? `${s.geo.unresolved} unresolved (passed)`
        : `${s.geo.unresolved} unresolved (GATED)`;
    lines.push(
      "",
      `  Geo: ${s.geo.total} in → ${s.geo.eligible} eligible, ${s.geo.ineligible} ineligible, ` +
        unresolvedNote
    );
    // Unmapped sources bypass geo filtering entirely (ruling Q2) — that has
    // to be loud and NAMED, never a silent pass-through.
    if (s.geo.unknownSource > 0) {
      lines.push(
        `  ⚠ Geo: ${s.geo.unknownSource} item(s) from source(s) with NO geo mapper passed ` +
          `unfiltered: ${s.geo.unknownSources.join(", ")}`
      );
    }
  }

  if (s.prerank !== null) {
    const reasons = Object.entries(s.prerank.gatedByReason)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${r} ${n}`)
      .join(", ");
    lines.push(
      "",
      `  Prerank: ${s.prerank.total} in → ${s.prerank.passed} passed, ${s.prerank.gated} gated` +
        (reasons === "" ? "" : ` (${reasons})`)
    );
  }

  if (s.calendar !== null) {
    const refused = s.calendar.refused.length;
    lines.push(
      `  Calendar (D18): ${s.calendar.written} entries written` +
        (refused === 0 ? "" : ` · ${refused} refused (no url and no title)`)
    );
  }

  const errored = s.sources.filter((x) => x.errors.length > 0);
  if (errored.length > 0) {
    lines.push("", "  Errors:");
    for (const x of errored) {
      for (const e of x.errors) lines.push(`    [${x.name}] ${e}`);
    }
  }

  if (s.autoDisabled.length > 0) {
    lines.push(
      "",
      `  ⚠ AUTO-DISABLED: ${s.autoDisabled.join(", ")}`,
      "    Two consecutive failed health checks. Discovery will skip these until",
      "    you run: oaos discover --stage3 --reenable <name>",
      "    Until then, fall back to Stage-1 manual intake for them."
    );
  }
  if (s.recovered.length > 0) {
    lines.push(
      "",
      `  ↻ RECOVERED: ${s.recovered.join(", ")}`,
      "    A clean check succeeded. Recovery never resumes a source by itself —",
      "    re-enable explicitly: oaos discover --stage3 --reenable <name>"
    );
  }

  const totals = ran.reduce(
    (acc, x) => ({
      fetched: acc.fetched + x.fetched,
      calendar: acc.calendar + x.calendarRouted,
      written: acc.written + x.written,
    }),
    { fetched: 0, calendar: 0, written: 0 }
  );
  lines.push(
    "",
    `Totals: ${ran.length} source${ran.length === 1 ? "" : "s"} ran · ${skipped.length} skipped · ` +
      `${totals.fetched} fetched · ${totals.calendar} calendar · ${totals.written} written`
  );
  if (s.dryRun) lines.push("Dry run: nothing was persisted (no pipeline, no calendar, no health write).");

  return lines.join("\n");
}

/**
 * Render the run's Gemini call tally.
 *
 * This block exists because of a specific failure: the first real activated
 * Stage-3 run reported success while 429ing on a large fraction of its LLM
 * calls, and the damage — 14 of 25 opportunities scored from defaults, zero
 * opportunity-specific evidence reasoning — was only discovered by auditing
 * Airtable by hand. A retried-then-succeeded call and a permanently failed one
 * were indistinguishable in the logs. Now the run says so itself.
 *
 * Printed for real runs only. Single-opportunity paths (`oaos intake`, Stage-2
 * discover) cannot hit a per-minute ceiling, so the same block there would be
 * noise on every run — and noise on every run is how a reader learns to skip it.
 */
export function formatGeminiStats(stats: LlmCallStats): string {
  if (stats.total === 0) return "";

  const waitSeconds = ((stats.throttleWaitMs + stats.backoffWaitMs) / 1000).toFixed(0);
  const lines = [
    "",
    `  Gemini: ${stats.total} calls · ${stats.rateLimited} hit the rate limit · ` +
      `${stats.succeededAfterRetry} recovered on retry · ${stats.failedPermanently} failed`,
    `          ${waitSeconds}s spent waiting (${(stats.throttleWaitMs / 1000).toFixed(0)}s pacing, ` +
      `${(stats.backoffWaitMs / 1000).toFixed(0)}s backoff)`,
  ];

  if (stats.failedPermanently > 0) {
    lines.push(
      `  ⚠ ${stats.failedPermanently} call${stats.failedPermanently === 1 ? "" : "s"} failed after ` +
        "every retry. Those opportunities fell back to rule-only scores and",
      "    generic evidence reasons. Lower GEMINI_MAX_RPM and re-score them with",
      "    `oaos score --company <name>`."
    );
  }

  return lines.join("\n");
}
