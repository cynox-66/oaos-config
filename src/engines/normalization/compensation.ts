// compensation.ts
// File: src/engines/normalization/compensation.ts
// Purpose: Parse a free-text compensation string into normalized INR values.
//          Source-agnostic: adapters surface `comp_raw`, this converts it.
//
// Rules (spec Section 1, Logic step 3 + Edge Cases):
//   - currency + period parsed → INR.  USD→INR at config rate.
//   - hourly figures scaled to a monthly figure using HOURS_PER_MONTH (160).
//   - annual figures divided by 12 (basis becomes monthly).
//   - equity-only → basis "equity", comps null (not penalized here).
//   - unpaid/volunteer → basis "unpaid", comps null.
//   - unparseable (no amount, or amount with no determinable basis)
//       → basis "unknown", comps null.

import type { CompBasis } from "./types";
import { USD_TO_INR, HOURS_PER_MONTH } from "./config";

export interface ParsedCompensation {
  comp_min: number | null;
  comp_max: number | null;
  comp_basis: CompBasis;
}

const UNKNOWN: ParsedCompensation = {
  comp_min: null,
  comp_max: null,
  comp_basis: "unknown",
};

const SCALE: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  lac: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/** Extract up to two scaled numeric amounts (handles k / lakh / crore / million). */
function extractAmounts(s: string): number[] {
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|million|lac|lakhs?|crores?|cr)?/gi;
  const amounts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    const digits = match[1].replace(/,/g, "");
    if (digits === "" || digits === ".") continue;
    let value = parseFloat(digits);
    if (Number.isNaN(value)) continue;
    const unit = match[2]?.toLowerCase();
    if (unit && SCALE[unit]) value *= SCALE[unit];
    amounts.push(value);
    if (amounts.length === 2) break;
  }
  return amounts;
}

/** Detect the compensation period, or null when none is expressed. */
function detectPeriod(s: string): "hourly" | "monthly" | "annual" | "project" | null {
  if (/per\s*hour|\/\s*h(?:r|our)\b|hourly|an\s+hour/.test(s)) return "hourly";
  if (/per\s*project|\/\s*project|fixed[\s-]price|project[\s-]based|one[\s-]time|for\s+the\s+project/.test(s))
    return "project";
  if (/per\s*year|\/\s*yr|\/\s*year|annual(?:ly)?|per\s+annum|p\.?a\.?\b/.test(s))
    return "annual";
  if (/per\s*month|\/\s*mo(?:nth)?\b|monthly|a\s+month/.test(s)) return "monthly";
  return null;
}

/** True when the string expresses USD (default assumption is domestic INR). */
function isUsd(s: string): boolean {
  return /\$|\busd\b|us\$/.test(s);
}

/**
 * Parse a compensation string into normalized INR. Pure and deterministic.
 *
 * @param raw free-text compensation, e.g. "$80k - $100k / year", "₹50,000/mo",
 *            "equity only", "unpaid", or null.
 */
export function parseCompensation(raw: string | null): ParsedCompensation {
  if (!raw) return UNKNOWN;
  const s = raw.toLowerCase().trim();
  if (s === "") return UNKNOWN;

  // Unpaid / volunteer always wins.
  if (/\bunpaid\b|\bvolunteer\b|pro\s*bono|no\s+(?:pay|salary|compensation)/.test(s)) {
    return { comp_min: null, comp_max: null, comp_basis: "unpaid" };
  }

  const hasEquity = /\bequity\b|stock\s+options?|\besop\b|\brsus?\b/.test(s);
  const amounts = extractAmounts(s);

  // Equity with no cash amount → equity-only.
  if (hasEquity && amounts.length === 0) {
    return { comp_min: null, comp_max: null, comp_basis: "equity" };
  }

  // No parseable amount at all → unknown.
  if (amounts.length === 0) return UNKNOWN;

  const period = detectPeriod(s);
  // Amount present but no determinable basis → unparseable basis → unknown.
  if (period === null) return UNKNOWN;

  const rate = isUsd(s) ? USD_TO_INR : 1;
  const convert = (n: number): number => {
    let inr = n * rate;
    if (period === "hourly") inr *= HOURS_PER_MONTH;
    else if (period === "annual") inr /= 12;
    return Math.round(inr);
  };

  const converted = amounts.map(convert).sort((a, b) => a - b);
  const comp_min = converted[0];
  const comp_max = converted.length > 1 ? converted[1] : converted[0];

  // hourly/monthly/annual all express a per-month figure; basis records origin
  // except annual which the spec folds into monthly.
  const basis: CompBasis =
    period === "annual" ? "monthly" : period === "hourly" ? "hourly" : period;

  return { comp_min, comp_max, comp_basis: basis };
}
