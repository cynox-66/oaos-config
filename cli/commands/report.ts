// commands/report.ts
// File: cli/commands/report.ts
// Purpose: `oaos report` — a weekly snapshot computed from the live base, using
//          the exact F5 definitions. All metrics are derived in JS from two
//          list reads (Opportunities + Outreach); date math uses ISO date-only
//          strings to stay timezone-stable.

import { existsSync } from "node:fs";
import { createAirtableClient, FIELD_NAMES, TABLE_NAMES } from "../../src/persistence";
import type { AirtableRecord } from "../../src/persistence";
import { createHealthStore, HEALTH_PATH } from "../../src/discovery/orchestrator";
import { formatReport, type ReportRow, type SourceHealthRow } from "../format";

const FO = FIELD_NAMES.opportunities;
const FU = FIELD_NAMES.outreach;

/** Follow-up interval (days after Sent Date) by step, per F5. */
const FU_INTERVAL_DAYS: Record<number, number> = { 0: 4, 1: 10, 2: 17 };

const str = (r: AirtableRecord, k: string): string =>
  typeof r.fields[k] === "string" ? (r.fields[k] as string) : "";
const num = (r: AirtableRecord, k: string): number | null =>
  typeof r.fields[k] === "number" ? (r.fields[k] as number) : null;

/** ISO date-only (YYYY-MM-DD) portion of a stored date/datetime value. */
function isoDay(value: string): string | null {
  if (value.trim() === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Map Follow-Up Status → step integer, or null to skip (terminal/absent). */
function mapFollowUpStep(status: string): number | null {
  switch (status) {
    case "None Sent":
      return 0;
    case "FU1 Sent":
      return 1;
    case "FU2 Sent":
      return 2;
    default:
      // "FU3 Sent" / "Complete" / absent → no further follow-up.
      return null;
  }
}

/** Add whole days to an ISO date-only string; returns a new ISO date-only. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Read persisted Stage-3 source health for the report, or undefined when no
 * Stage-3 run has ever happened. A CORRUPTED file is not swallowed here — the
 * store throws naming the path, and the report fails loudly rather than
 * reporting "all healthy" from a file it could not read.
 */
function readSourceHealth(): SourceHealthRow[] | undefined {
  if (!existsSync(HEALTH_PATH)) return undefined;
  return createHealthStore(HEALTH_PATH)
    .all()
    .map((s) => ({
      name: s.source,
      status: s.status,
      consecutiveFailures: s.consecutiveFailures,
      detail: s.lastResult?.detail ?? "(never checked)",
      checkedAt: s.lastResult?.checkedAt ?? null,
      recovered: s.recoveredFromDisabled,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Run the `oaos report` command. */
export async function runReport(): Promise<void> {
  const client = createAirtableClient();
  const [opps, outreach] = await Promise.all([
    client.listRecords(TABLE_NAMES.opportunities),
    client.listRecords(TABLE_NAMES.outreach),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = addDays(today, -7);

  // Discovered this week: Date Found >= today-7.
  const discoveredThisWeek = opps.records.filter((r) => {
    const d = isoDay(str(r, FO.date_found));
    return d !== null && d >= weekAgo;
  }).length;

  // Sent this week: Sent Date >= today-7.
  const sentThisWeek = outreach.records.filter((r) => {
    const d = isoDay(str(r, FU.sent_date));
    return d !== null && d >= weekAgo;
  }).length;

  // Responses received (all time): Status = "Replied".
  const responsesAllTime = outreach.records.filter(
    (r) => str(r, FU.status) === "Replied"
  ).length;

  // Follow-ups due today: Status = "Sent", step mapped, due <= today.
  const followUpsDueToday = outreach.records.filter((r) => {
    if (str(r, FU.status) !== "Sent") return false;
    const sent = isoDay(str(r, FU.sent_date));
    if (sent === null) return false;
    const step = mapFollowUpStep(str(r, FU.follow_up_status));
    if (step === null) return false;
    return addDays(sent, FU_INTERVAL_DAYS[step]) <= today;
  }).length;

  // Top 3 unactioned S/A: Tier S or A AND Status = Discovered, by Total Score desc.
  const topUnactioned: ReportRow[] = opps.records
    .filter((r) => {
      const tier = str(r, FO.tier);
      return (tier === "S" || tier === "A") && str(r, FO.status) === "Discovered";
    })
    .sort((a, b) => (num(b, FO.total_score) ?? -Infinity) - (num(a, FO.total_score) ?? -Infinity))
    .slice(0, 3)
    .map((r) => ({
      company: str(r, FO.company),
      role: str(r, FO.role),
      total: num(r, FO.total_score),
      tier: str(r, FO.tier),
      source: str(r, FO.source_name),
    }));

  console.log(
    formatReport({
      discoveredThisWeek,
      sentThisWeek,
      responsesAllTime,
      followUpsDueToday,
      topUnactioned,
      sourceHealth: readSourceHealth(),
    })
  );
}
