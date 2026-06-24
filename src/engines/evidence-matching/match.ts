// match.ts
// File: src/engines/evidence-matching/match.ts
// Purpose: Core of the Evidence Matching Engine (Engine 3). The fit formula,
//          candidate filtering, ranking + tie-break + dedupe, coverage-gap
//          detection (all pure/deterministic), and the LLM reason pass.

import { sha1 } from "../normalization/fingerprint";
import { createGeminiClient } from "../scoring";
import type {
  Evidence,
  EvidenceMatch,
  GeminiClient,
  MatchOptions,
  MatchRequest,
  Opportunity,
  RankedEvidence,
  ScoredCandidate,
} from "./types";
import {
  COVERAGE_FIT_THRESHOLD,
  FIT_FLOOR,
  FIT_WEIGHTS,
  MAX_RESULTS,
  MISSING_RECENCY_AGE_MONTHS,
  MS_PER_MONTH,
  RECENCY_HALFLIFE_MONTHS,
  TIE_EPSILON,
  TYPE_PREFERENCES,
  WRITING_DEVREL_REGEX,
} from "./config";
import {
  buildReasonPrompt,
  buildStrictReasonPrompt,
  fallbackReason,
  isFabricated,
  parseReason,
} from "./prompt";

// ============================================================
// Opportunity tag derivation (GAP A)
// ============================================================

/** Distinct tech_tags across the whole inventory (the scan vocabulary). */
export function allInventoryTags(inventory: Evidence[]): string[] {
  const set = new Set<string>();
  for (const ev of inventory) for (const t of ev.tech_tags) set.add(t);
  return [...set];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word scan of `text` for each candidate tag (case-insensitive),
 * returning matched tags in their original casing.
 */
export function extractTagsFromText(text: string, vocabulary: string[]): string[] {
  const haystack = text.toLowerCase();
  const found: string[] = [];
  for (const tag of vocabulary) {
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(tag.toLowerCase())}(?:$|[^a-z0-9])`);
    if (re.test(haystack)) found.push(tag);
  }
  return found;
}

/**
 * The opportunity's effective tag set (GAP A): domain[] unioned with tags
 * scanned out of role + description against the inventory tag vocabulary.
 */
export function buildOpportunityTags(
  opportunity: Opportunity,
  inventoryTags: string[]
): Set<string> {
  return new Set<string>([
    ...opportunity.domain,
    ...extractTagsFromText(
      `${opportunity.role} ${opportunity.description_norm}`,
      inventoryTags
    ),
  ]);
}

// ============================================================
// Fit formula (pure)
// ============================================================

function intersectionSize(a: string[], b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/** recency_factor = 0.5^(age_months/18), clamped to [0,1] (GAP B). */
export function computeRecencyFactor(recencyDate: string, nowMs: number): number {
  const t = Date.parse(recencyDate);
  const ageMonths = Number.isNaN(t)
    ? MISSING_RECENCY_AGE_MONTHS
    : (nowMs - t) / MS_PER_MONTH;
  const factor = Math.pow(0.5, ageMonths / RECENCY_HALFLIFE_MONTHS);
  return Math.max(0, Math.min(1, factor));
}

/**
 * The spec fit formula for one asset. Pure and deterministic given `nowMs`.
 * `*_overlap_ratio = |intersection| / |opportunity side|` (0 when the
 * opportunity side is empty).
 */
export function computeFit(
  evidence: Evidence,
  opportunity: Opportunity,
  opportunityTags: Set<string>,
  nowMs: number
): number {
  const tagRatio =
    opportunityTags.size === 0
      ? 0
      : intersectionSize(evidence.tech_tags, opportunityTags) / opportunityTags.size;
  const domainRatio =
    opportunity.domain.length === 0
      ? 0
      : intersectionSize(evidence.domains, new Set(opportunity.domain)) /
        opportunity.domain.length;
  const strength = Math.max(0, Math.min(5, evidence.strength)) / 5;
  const recency = computeRecencyFactor(evidence.recency_date, nowMs);

  return (
    FIT_WEIGHTS.tag * tagRatio +
    FIT_WEIGHTS.domain * domainRatio +
    FIT_WEIGHTS.strength * strength +
    FIT_WEIGHTS.recency * recency
  );
}

// ============================================================
// Candidate filter + ranking (pure)
// ============================================================

/** Evidence sharing ≥1 domain or tech_tag with the opportunity (spec step 1). */
function isCandidate(evidence: Evidence, opportunity: Opportunity, opportunityTags: Set<string>): boolean {
  const opportunityDomains = new Set(opportunity.domain);
  return (
    intersectionSize(evidence.domains, opportunityDomains) > 0 ||
    intersectionSize(evidence.tech_tags, opportunityTags) > 0
  );
}

/** Classify an opportunity for the type-preference tie-break (GAP D). */
export function classifyOpportunity(opportunity: Opportunity): keyof typeof TYPE_PREFERENCES | null {
  if (opportunity.domain.includes("Security") || opportunity.domain.includes("eBPF")) {
    return "security/eBPF";
  }
  if (opportunity.category === "Freelance") return "freelance";
  if (WRITING_DEVREL_REGEX.test(opportunity.role)) return "writing/devrel";
  return null;
}

/** Index of an evidence type in the preference list, or Infinity if absent. */
function preferenceIndex(type: Evidence["type"], preferred: Evidence["type"][]): number {
  const i = preferred.indexOf(type);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/**
 * Rank candidates: fit desc, with the type-preference tie-break applied to
 * fits within TIE_EPSILON, then dedupe by id (max 1 per id), apply the 0.25
 * floor, and keep the top 3. Pure and deterministic.
 */
export function rankEvidence(request: MatchRequest, nowMs: number): ScoredCandidate[] {
  const { opportunity, inventory } = request;
  const opportunityTags = buildOpportunityTags(opportunity, allInventoryTags(inventory));
  const preferred = classifyOpportunity(opportunity);
  const prefList = preferred ? TYPE_PREFERENCES[preferred] : [];

  const scored: ScoredCandidate[] = inventory
    .filter((ev) => isCandidate(ev, opportunity, opportunityTags))
    .map((ev) => ({ evidence: ev, fit_score: computeFit(ev, opportunity, opportunityTags, nowMs) }));

  scored.sort((a, b) => {
    const df = b.fit_score - a.fit_score;
    if (Math.abs(df) > TIE_EPSILON) return df > 0 ? 1 : -1;
    // Tie: prefer the type higher in the preference list.
    const pa = preferenceIndex(a.evidence.type, prefList);
    const pb = preferenceIndex(b.evidence.type, prefList);
    if (pa !== pb) return pa - pb;
    // Deterministic final tie-break by id.
    if (df !== 0) return df > 0 ? 1 : -1;
    return a.evidence.id < b.evidence.id ? -1 : a.evidence.id > b.evidence.id ? 1 : 0;
  });

  // Dedupe by evidence id (max 1 occurrence per id; handles duplicate input ids).
  // TODO: session-level max-2 tracking — implement when a stateful match session wrapper is added.
  const seenIds = new Set<string>();
  const deduped: ScoredCandidate[] = [];
  for (const c of scored) {
    if (seenIds.has(c.evidence.id)) continue;
    seenIds.add(c.evidence.id);
    deduped.push(c);
  }

  return deduped.filter((c) => c.fit_score >= FIT_FLOOR).slice(0, MAX_RESULTS);
}

// ============================================================
// Coverage gap (GAP C, pure)
// ============================================================

/**
 * Name the "top required capability" with no proof at fit ≥ 0.4, or null.
 * The top capability is the opportunity tag most frequently tagged across the
 * inventory; ties break to opportunity.domain order, then alphabetical.
 */
export function computeCoverageGap(
  request: MatchRequest,
  scored: ScoredCandidate[],
  nowMs: number
): string | null {
  const { opportunity, inventory } = request;
  const opportunityTags = buildOpportunityTags(opportunity, allInventoryTags(inventory));
  if (opportunityTags.size === 0) return null;

  // Frequency of each opportunity tag across the full inventory.
  const freq = new Map<string, number>();
  for (const tag of opportunityTags) {
    let count = 0;
    for (const ev of inventory) if (ev.tech_tags.includes(tag)) count++;
    freq.set(tag, count);
  }

  const maxFreq = Math.max(...freq.values());
  const tied = [...freq.entries()].filter(([, v]) => v === maxFreq).map(([k]) => k);
  // Structured (domain[]) beats derived; then alphabetical. domain[] is a
  // Domain-vocab union but opportunity tags are arbitrary strings, so compare
  // as plain strings.
  const domainStrings = opportunity.domain as readonly string[];
  const inDomain = tied
    .filter((t) => domainStrings.includes(t))
    .sort((a, b) => domainStrings.indexOf(a) - domainStrings.indexOf(b));
  const topTag = inDomain.length > 0 ? inDomain[0] : [...tied].sort()[0];

  // We score against the full inventory (any asset tagged topTag is a candidate).
  const covered = inventory.some(
    (ev) =>
      ev.tech_tags.includes(topTag) &&
      computeFit(ev, opportunity, opportunityTags, nowMs) >= COVERAGE_FIT_THRESHOLD
  );
  // Honor the engine's own ranking too (an asset may already be a strong match).
  const coveredByRanked = scored.some(
    (c) => c.evidence.tech_tags.includes(topTag) && c.fit_score >= COVERAGE_FIT_THRESHOLD
  );

  return covered || coveredByRanked ? null : topTag;
}

// ============================================================
// LLM reason pass (GAP F)
// ============================================================

async function generateReason(
  evidence: Evidence,
  opportunity: Opportunity,
  client: GeminiClient
): Promise<string> {
  try {
    const first = parseReason(await client.generate(buildReasonPrompt(evidence, opportunity)));
    if (!isFabricated(first, evidence, opportunity)) return first;

    // One stricter retry quoting the allowed source text.
    const second = parseReason(
      await client.generate(buildStrictReasonPrompt(evidence, opportunity))
    );
    if (!isFabricated(second, evidence, opportunity)) return second;

    return fallbackReason(evidence);
  } catch (err) {
    console.warn(`[evidence-matching] reason generation failed: ${String(err)}`);
    return fallbackReason(evidence);
  }
}

// ============================================================
// Public entry point
// ============================================================

function resolveNowMs(now: MatchOptions["now"]): number {
  if (now === undefined) return Date.now();
  return now instanceof Date ? now.getTime() : Date.parse(now);
}

/**
 * Select the 1–3 evidence assets that best prove capability for an opportunity,
 * each with a grounded one-line reason. Scoring/ranking/coverage are pure and
 * deterministic; only the per-asset reason uses the (injectable) Gemini client.
 *
 * @param request opportunity + full inventory.
 * @param options.client injected Gemini client (defaults to a real one).
 * @param options.now reference clock for recency decay (default: now).
 */
export async function match(
  request: MatchRequest,
  options: MatchOptions = {}
): Promise<EvidenceMatch> {
  const nowMs = resolveNowMs(options.now);
  const ranked = rankEvidence(request, nowMs);
  const coverage_gap = computeCoverageGap(request, ranked, nowMs);

  const client: GeminiClient = options.client ?? createGeminiClient();
  const rankedWithReasons: RankedEvidence[] = [];
  for (const c of ranked) {
    const reason = await generateReason(c.evidence, request.opportunity, client);
    rankedWithReasons.push({
      evidence_id: c.evidence.id,
      fit_score: c.fit_score,
      reason,
    });
  }

  const idsJoined =
    rankedWithReasons.length > 0
      ? rankedWithReasons.map((r) => r.evidence_id).join(",")
      : "none";

  return {
    id: sha1(`${request.opportunity.fingerprint}|${idsJoined}`),
    ranked: rankedWithReasons,
    top_score: rankedWithReasons.length > 0 ? rankedWithReasons[0].fit_score : 0,
    coverage_gap,
  };
}
