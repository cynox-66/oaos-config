# Changelog — Prerank Gate

## [0.1.0] — 2026-07-20

Initial implementation. Wave 0 of OAOS Phase 1.

### Added

- `prerank(request, deps?)` — pure lexical pre-filter for Stage-3 discovery
  batches. Hard gates (`insufficient_text`, `negative_term`, `location`),
  IDF-weighted lexical relevance against the current run's corpus, relevance
  floor, and top-K selection with recency tiebreak.
- Homogeneous-batch fallback: when batch-relative IDF collapses to zero but
  vocabulary matches exist, scoring falls back to plain overlap so a fully
  relevant single-source batch is not gated out wholesale. Reserved the
  all-zero path for the genuine no-match case.
- Accounting invariant enforced in-module (throws): every input item appears
  exactly once across `passed` and `gated`; nothing is dropped without a
  recorded reason.
- `PrerankStats` per-run counters shaped for Engine 9 consumption, with
  injectable `now()` for deterministic output.
- `DEFAULT_PRERANK_CONFIG` (`maxPerRun: 25`, `relevanceFloor: 0.05`,
  `remoteOnly: true`) and `DEFAULT_VOCABULARY` (Engine 1's controlled domain
  vocabulary plus surface variants and role terms) as pure exported data.
  `prerank()` has no implicit vocabulary fallback — callers pass it explicitly.
- 38 fixture-based unit tests across `tests/prerank.test.ts` and
  `tests/text.test.ts`.

### Notes

- No live caller yet. Wiring into `oaos discover` happens when Stage 3 sources
  land in a later wave.
- Zero LLM calls, zero network, zero file I/O by design.
- Approach reference: jobsync `greenhouse/rank.ts` (MIT) — idea borrowed, code
  written fresh.
