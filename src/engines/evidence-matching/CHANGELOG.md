# Changelog — Evidence Matching Engine (Engine 3)

## [Initial] — 2026-06-24

Implemented Engine 3 (Evidence Matching Engine) per `docs/engine-specs.md`
Section 3, with all spec gaps resolved by operator direction (opportunity tag
derivation, recency formula, coverage-gap heuristic, type-preference tie-break,
id dedupe, fabrication check + fallback, EvidenceMatch id). Scope is Engine 3
only; Engines 1, 2, and 4–12 are untouched.

### Added
- `Evidence`, `MatchRequest`, `RankedEvidence`, and `EvidenceMatch` types
  matching the spec. `EvidenceMatch` is a `type` alias so it is structurally
  assignable to Engine 2's input-view `EvidenceMatch` (compile-time-checked).
- Pure fit scoring: `computeFit` (exact 0.45/0.30/0.15/0.10 weights),
  `computeRecencyFactor` (0.5^(age/18), clamped, missing→36mo),
  `buildOpportunityTags` / `extractTagsFromText` (GAP A tag derivation).
- `rankEvidence` — candidate filter, fit-desc ranking with the type-preference
  tie-break (TIE_EPSILON), id dedupe (max 1 per id), 0.25 floor, top 3.
- `computeCoverageGap` — most-frequent opportunity tag across inventory; names
  it when no asset proves it at fit ≥ 0.4 (ties: domain order, then alphabetical).
- LLM reason pass with a hard fabrication trace-check, one stricter retry, and a
  relevance_blurb fallback (truncated) on repeated fabrication / failure.
- `match` — orchestrates rank → coverage → reasons → deterministic sha1 id.
  Gemini client is injectable; only the reason pass does I/O.
- `inventory.ts` — `parseInventory` / `loadInventory` for the C4 markdown source.
- `config.ts` — all weights, floor, decay, thresholds, tie epsilon, and type
  preferences.
- Reused (not duplicated): `createGeminiClient` + `GeminiClient` from Engine 2,
  and `sha1` from Engine 1.
- `evidence/inventory.md` — the C4 source of truth, populated with the 6 assets
  from `scoring/rubric.md` in a parseable `json` block.
- Vitest suite (24 tests): determinism, top-1 accuracy (≥10 labeled pairs),
  floor/cap, recency decay, tie-break, dedupe, coverage_gap, zero-match, and the
  reason/fabrication paths. Gemini mocked throughout.
- Engine README and TSDoc.

### Tooling
- No new dependencies. Uses the existing `vitest`; reuses Node `crypto`/`fs` and
  global `fetch`. No `tsconfig` added (repo runs `.ts` via `tsx`).
