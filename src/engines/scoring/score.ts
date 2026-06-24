// score.ts
// File: src/engines/scoring/score.ts
// Purpose: Core of the Opportunity Scoring Engine (Engine 2). Two-pass scoring:
//          a pure deterministic rule pass + a Gemini LLM pass for the three
//          judgment factors, merged into a Score. Failure handling, clamping,
//          idempotency, and the tier/confidence/uncertainty rules live here.

import { createHash } from "crypto";
import type {
  ComputeScoreOptions,
  Contact,
  EvidenceMatch,
  GeminiClient,
  LLMScoreFactors,
  RulePassFactors,
  Score,
  ScoreRequest,
  Tier,
} from "./types";
import {
  CONFIDENCE_WEIGHTS,
  EQUITY_LEVERAGE_CAP,
  FACTOR_MAX,
  LLM_FALLBACK_CONFIDENCE_CAP,
  OSS_DEFAULT,
  OSS_INVOLVEMENT_SCORES,
  REACHABILITY_DEFAULT,
  REACHABILITY_SCORES,
  RELATIONSHIP_DEFAULT,
  RELATIONSHIP_SCORES,
  STAGE_DEFAULT,
  STAGE_SCORES,
  TIER_BOUNDARIES,
  TIER_THRESHOLDS,
  TIER_UNCERTAIN_CONFIDENCE_MAX,
  TIER_UNCERTAIN_MARGIN,
  UNPAID_LEVERAGE_CAP,
} from "./config";
import { buildPrompt, STRICT_RETRY_PREFIX } from "./prompt";
import { createGeminiClient } from "./gemini";

// ============================================================
// Small utilities
// ============================================================

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Round, then clamp to [0, max]. Logs an anomaly when the value was out of range. */
function clampFactor(value: number, max: number, name: string): number {
  const rounded = Math.round(value);
  const clamped = Math.max(0, Math.min(max, rounded));
  if (clamped !== rounded) {
    console.warn(`[scoring] ${name}=${value} out of range, clamped to ${clamped} (max ${max})`);
  }
  return clamped;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ============================================================
// inputs_hash (spec + GAPs 2, 3, 4)
// ============================================================

/** evidence_match.id, or a content hash, or "none" — see GAP 4. */
function evidenceMatchId(em: EvidenceMatch | null): string {
  if (em === null) return "none";
  if (typeof em.id === "string" && em.id.length > 0) return em.id;
  return sha1(JSON.stringify(em));
}

/**
 * inputs_hash = sha1(fingerprint | research_version | contacts_ids | evidence_id).
 * Components joined with "|" for collision safety (mirrors Engine 1's approach).
 */
export function computeInputsHash(request: ScoreRequest): string {
  const researchVersion =
    request.research === null ? "none" : sha1(JSON.stringify(request.research));
  const contactsIds = request.contacts
    .map((c) => c.id)
    .sort()
    .join(",");
  const evidenceId = evidenceMatchId(request.evidence_match);
  return sha1(
    [request.opportunity.fingerprint, researchVersion, contactsIds, evidenceId].join("|")
  );
}

// ============================================================
// Rule pass (pure, deterministic)
// ============================================================

function qualityOss(request: ScoreRequest): number {
  const v = request.research?.oss_involvement;
  if (typeof v === "string" && v in OSS_INVOLVEMENT_SCORES) {
    return OSS_INVOLVEMENT_SCORES[v as keyof typeof OSS_INVOLVEMENT_SCORES];
  }
  return OSS_DEFAULT;
}

function qualityStage(request: ScoreRequest): number {
  if (request.research === null) return STAGE_DEFAULT;
  const v = request.research.stage;
  if (typeof v === "string" && v in STAGE_SCORES) {
    return STAGE_SCORES[v as keyof typeof STAGE_SCORES];
  }
  return STAGE_DEFAULT;
}

function matchContact(contacts: Contact[]): number {
  if (contacts.length === 0) return 0;
  const best = Math.max(
    ...contacts.map((c) => REACHABILITY_SCORES[c.reachability] ?? REACHABILITY_DEFAULT)
  );
  return Math.min(best, FACTOR_MAX.match.contact);
}

function matchEvidence(em: EvidenceMatch | null): number {
  if (em === null) return 0;
  return Math.min(Math.round(em.top_score * 10), FACTOR_MAX.match.evidence);
}

function matchNetwork(contacts: Contact[]): number {
  if (contacts.length === 0) return 0;
  return Math.max(
    ...contacts.map((c) => RELATIONSHIP_SCORES[c.relationship] ?? RELATIONSHIP_DEFAULT)
  );
}

/**
 * Compute the deterministic factors (quality.oss, quality.stage, match.contact,
 * match.evidence, match.network). Pure: identical input → identical output, no
 * LLM, no I/O.
 */
export function computeRulePass(request: ScoreRequest): RulePassFactors {
  return {
    quality: {
      oss: qualityOss(request),
      stage: qualityStage(request),
    },
    match: {
      contact: matchContact(request.contacts),
      evidence: matchEvidence(request.evidence_match),
      network: matchNetwork(request.contacts),
    },
  };
}

// ============================================================
// LLM response parsing (GAP 9)
// ============================================================

/** Extract a JSON object substring, tolerating code fences / surrounding prose. */
function extractJsonObject(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return stripped.slice(start, end + 1);
}

/**
 * Parse the LLM response into {@link LLMScoreFactors}. Returns null ONLY when
 * the JSON is unparseable (which triggers a retry). A parseable object with a
 * missing/invalid numeric field is accepted with that field defaulted to 0 and
 * an anomaly logged (per GAP 9). Values are NOT clamped here — that happens in
 * {@link mergeScores}.
 */
export function parseAndValidateLLMResponse(raw: string): LLMScoreFactors | null {
  const json = extractJsonObject(raw);
  if (json === null) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;

  const record = obj as Record<string, unknown>;
  const num = (key: string): number => {
    const v = record[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    console.warn(`[scoring] LLM field '${key}' missing/invalid, defaulting to 0`);
    return 0;
  };

  return {
    quality_domain: num("quality_domain"),
    quality_leverage: num("quality_leverage"),
    match_overlap: num("match_overlap"),
    rationale: typeof record.rationale === "string" ? record.rationale : "",
  };
}

// ============================================================
// Tier / confidence / merge
// ============================================================

function deriveTier(total: number): Tier {
  if (total >= TIER_THRESHOLDS.S) return "S";
  if (total >= TIER_THRESHOLDS.A) return "A";
  if (total >= TIER_THRESHOLDS.B) return "B";
  return "C";
}

function computeConfidence(request: ScoreRequest, llmFailed: boolean): number {
  let confidence =
    CONFIDENCE_WEIGHTS.completeness * request.opportunity.completeness +
    CONFIDENCE_WEIGHTS.research * (request.research ? 1 : 0) +
    CONFIDENCE_WEIGHTS.contacts * (request.contacts.length > 0 ? 1 : 0);
  if (llmFailed) confidence = Math.min(confidence, LLM_FALLBACK_CONFIDENCE_CAP);
  return round4(confidence);
}

/**
 * Merge the rule-pass factors with the LLM factors into a full {@link Score}.
 * Pure and deterministic given its inputs (including `now`). Applies factor
 * clamping, the equity/unpaid leverage cap (GAP 10), tier derivation,
 * confidence, and the tier_uncertain flag.
 *
 * @param llm parsed LLM factors, or null when the LLM failed.
 * @param opts.llmFailed true after the retry also failed → rule-pass-only.
 * @param opts.now ISO datetime stamped as `scored_at`.
 */
export function mergeScores(
  request: ScoreRequest,
  rule: RulePassFactors,
  llm: LLMScoreFactors | null,
  opts: { llmFailed: boolean; now: string }
): Score {
  const { opportunity } = request;

  // LLM-scored factors (clamped). Null/failed → 0.
  const domain = clampFactor(llm?.quality_domain ?? 0, FACTOR_MAX.quality.domain, "quality.domain");
  let leverage = clampFactor(
    llm?.quality_leverage ?? 0,
    FACTOR_MAX.quality.leverage,
    "quality.leverage"
  );
  const overlap = clampFactor(llm?.match_overlap ?? 0, FACTOR_MAX.match.overlap, "match.overlap");

  // Rule-scored factors (clamped defensively).
  const oss = clampFactor(rule.quality.oss, FACTOR_MAX.quality.oss, "quality.oss");
  const stage = clampFactor(rule.quality.stage, FACTOR_MAX.quality.stage, "quality.stage");
  const contact = clampFactor(rule.match.contact, FACTOR_MAX.match.contact, "match.contact");
  const evidence = clampFactor(rule.match.evidence, FACTOR_MAX.match.evidence, "match.evidence");
  const network = clampFactor(rule.match.network, FACTOR_MAX.match.network, "match.network");

  // Equity / unpaid leverage cap (non-OSS only).
  const notes: string[] = [];
  if (opportunity.category !== "OSS") {
    if (opportunity.comp_basis === "equity") {
      leverage = Math.min(leverage, EQUITY_LEVERAGE_CAP);
      notes.push("leverage capped: equity-only non-OSS");
    } else if (opportunity.comp_basis === "unpaid") {
      leverage = Math.min(leverage, UNPAID_LEVERAGE_CAP);
      notes.push("leverage capped: unpaid non-OSS");
    }
  }

  const qualityTotal = Math.min(domain + oss + leverage + stage, FACTOR_MAX.quality.total);
  const matchTotal = Math.min(overlap + evidence + contact + network, FACTOR_MAX.match.total);
  const total = qualityTotal + matchTotal;

  const tier = deriveTier(total);
  const confidence = computeConfidence(request, opts.llmFailed);
  const tier_uncertain =
    TIER_BOUNDARIES.some((b) => Math.abs(total - b) <= TIER_UNCERTAIN_MARGIN) &&
    confidence < TIER_UNCERTAIN_CONFIDENCE_MAX;

  const base = opts.llmFailed ? "LLM scoring unavailable" : llm?.rationale ?? "";
  const rationale = [base, ...notes].filter((s) => s.length > 0).join(" ");

  return {
    quality: { domain, oss, leverage, stage, total: qualityTotal },
    match: { overlap, evidence, contact, network, total: matchTotal },
    total,
    tier,
    confidence,
    rationale,
    scored_at: opts.now,
    inputs_hash: computeInputsHash(request),
    tier_uncertain,
  };
}

// ============================================================
// Orchestration
// ============================================================

/**
 * Score an opportunity end-to-end: idempotency check → rule pass → LLM pass
 * (with one stricter retry, then rule-pass-only degrade) → merge.
 *
 * @param request the ScoreRequest.
 * @param options.client injected Gemini client (defaults to a real one).
 * @param options.previous a stored Score; returned unchanged when its
 *        inputs_hash matches (idempotent skip — no LLM call).
 * @param options.now fixed scored_at for deterministic tests.
 */
export async function computeScore(
  request: ScoreRequest,
  options: ComputeScoreOptions = {}
): Promise<Score> {
  const inputsHash = computeInputsHash(request);

  // Idempotency: identical inputs → return the stored score, no LLM call.
  if (options.previous && options.previous.inputs_hash === inputsHash) {
    return options.previous;
  }

  const rule = computeRulePass(request);
  const client: GeminiClient = options.client ?? createGeminiClient();
  const now = options.now ?? new Date().toISOString();

  let llm: LLMScoreFactors | null = null;
  let llmFailed = false;

  try {
    const first = await client.generate(buildPrompt(request));
    llm = parseAndValidateLLMResponse(first);

    if (llm === null) {
      // One retry with a stricter JSON-only instruction.
      const strictPrompt = `${STRICT_RETRY_PREFIX}\n${buildPrompt(request)}`;
      const second = await client.generate(strictPrompt);
      llm = parseAndValidateLLMResponse(second);
      if (llm === null) llmFailed = true;
    }
  } catch (err) {
    console.warn(`[scoring] LLM call failed: ${String(err)}`);
    llmFailed = true;
    llm = null;
  }

  return mergeScores(request, rule, llm, { llmFailed, now });
}
