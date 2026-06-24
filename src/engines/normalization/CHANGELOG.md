# Changelog — Opportunity Normalization Engine (Engine 1)

## [Initial] — 2026-06-24

Implemented Engine 1 (Opportunity Normalization Engine) per
`docs/engine-specs.md` Section 1. Scope is Engine 1 only; Engines 2–12 are
untouched. No persistence, no LLM, no network — pure deterministic logic.

### Added
- Canonical `Opportunity` and `RawItem` types plus all enums (`SourceType`,
  `Category`, `CompBasis`, `Remote`, `Domain`), matching the spec's field list
  and value sets. Includes the two spec-mandated extra fields `needs_enrichment`
  and `also_seen_in`.
- `normalize(raw: RawItem): Opportunity` — pure normalization: adapter routing,
  description cleaning (HTML strip + boilerplate blocklist + whitespace
  collapse), compensation → INR (USD×84, hourly×160 hrs, annual÷12), domain
  derivation over the controlled vocabulary, category inference, deterministic
  `sha1` fingerprint, and `completeness` / `needs_enrichment`.
- `merge(existing, incoming): Opportunity` — pure dedupe fold: advances
  `date_found` only when the incoming source is higher-signal (manual >
  automated) and appends to `also_seen_in`. Store lookup/write is the caller's.
- Source adapters behind a common `SourceAdapter` interface: `manual`
  (object or labeled free-text) and `job_board` (generic fallback), with an
  ordered registry + `selectAdapter`.
- Config module (`config.ts`): FX rate (`USD_TO_INR = 84`), hours-per-month,
  boilerplate blocklist, domain keyword vocabulary, company-suffix strip list.
- Vitest test suite (29 tests): schema validity, determinism, ≥10 labeled
  fixtures per adapter (≥90% category + ≥1 domain), compensation cases,
  completeness, dedupe/merge, and all spec edge cases.
- Engine README and TSDoc on exported types and public functions.

### Tooling
- Added `vitest` (dev) and set `"test": "vitest run"`. No `tsconfig` added
  (repo runs `.ts` directly via `tsx`).
