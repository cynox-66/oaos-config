# Changelog — Opportunity Scoring Engine (Engine 2)

## [Initial] — 2026-06-24

Implemented Engine 2 (Opportunity Scoring Engine) per `docs/engine-specs.md`
Section 2, with all spec gaps resolved by operator direction (rule-pass
assignment of `quality.oss`/`match.network`, factor mappings, hash composition,
LLM contract, leverage caps). Scope is Engine 2 only; Engines 1 and 3–12 are
untouched.

### Added
- `ScoreRequest` / `Score` types matching the spec, plus input-only views
  (`Research`, `Contact`, `EvidenceMatch`) declaring only the fields Engine 2
  reads, and the `LLMScoreFactors` / `GeminiClient` types.
- `computeRulePass` — pure, deterministic rule pass for the five structured
  factors (`quality.oss`, `quality.stage`, `match.contact`, `match.evidence`,
  `match.network`).
- `buildPrompt` — pure prompt builder embedding the rubric definitions for the
  three LLM-scored factors and the exact JSON output contract.
- `parseAndValidateLLMResponse` — tolerant JSON extraction; returns null only on
  unparseable JSON (→ retry); defaults missing numeric fields to 0 with a logged
  anomaly.
- `mergeScores` — merges rule + LLM factors, clamps to factor maxima, applies
  the equity/unpaid leverage cap (non-OSS), derives tier (S≥85/A≥70/B≥50/C),
  computes confidence and the `tier_uncertain` flag.
- `computeScore` — orchestrates idempotency check (`inputs_hash`) → rule pass →
  LLM pass (one stricter retry, then rule-pass-only degrade with confidence ≤0.4)
  → merge. Gemini client and `previous` score are injectable.
- `createGeminiClient` — thin, injectable wrapper over
  `gemini-2.0-flash:generateContent` (the only networked module).
- `config.ts` — tier thresholds, per-factor maxima, confidence weights, and the
  deterministic rule-pass mapping tables.
- Vitest suite (32 tests): rule-pass determinism + mappings, `inputs_hash`,
  confidence, monotonicity, clamping, LLM retry/degrade, idempotency,
  `tier_uncertain`, leverage cap, and ≥10 calibration fixtures (no catastrophic
  inversions). All mocked — no real Gemini calls.
- Engine README and TSDoc throughout.

### Tooling
- No new dependencies. Uses the existing `vitest`; reuses Node's built-in
  `crypto` and global `fetch`. No `tsconfig` added (repo runs `.ts` via `tsx`).
