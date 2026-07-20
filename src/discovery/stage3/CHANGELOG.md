# Changelog — Stage-3 Source Families

## [0.1.0] — 2026-07-20

Initial implementation. Wave 2 of OAOS Phase 1 — the shared frame Waves 3-5
hang ~14 concrete sources on. No concrete source, no live network call, no
CLI wiring this wave.

### Added

- `Stage3Source` — the uniform surface (`fetch`, `healthCheck`) every
  source family presents, regardless of family. `SourceDeps` (`httpGet`,
  `httpPost`, `now`) is injected; no module imports `fetch`/`http` directly.
- `FetchResult` / `SourceError` — partial failure as data, never a thrown
  total-stop. Added `calendarEntries?: CalendarEntry[]` beyond the original
  spec to keep `fetch()`'s return type uniform across families while still
  letting calendar-sink Atom feeds surface typed entries for Wave 4's
  calendar writer.
- `advanceHealth(state, result)` / `createHealthState(source)` — the shared
  health state machine (`healthy` -> `probation` -> `auto_disabled`, with a
  one-advance `recoveredFromDisabled` flag on recovery). Exhaustively tested,
  all 8 transitions.
- `createCompanyBoardSource(adapter, registry, enabled?)` — registry-driven
  `company_board` source. `healthCheck` is family-level: `ok: false` only
  when every enabled entry failed; partial failure is `ok: true` with the
  degraded entries named in `detail`. This is a deliberate correction from
  the original per-fetch-error `ok` proposal — a naive `ok: errors.length
  === 0` would let one rotted token auto-disable an entire healthy platform
  via the health machine, defeating the point of per-entry isolation.
- `createGitHubRepoSource(config, adapter, tokenProvider?)` — Contents API
  URL construction, auth header, response/shape parsing for the
  `github_repo` family. Single-config family, so `healthCheck` uses the
  strict `ok: errors.length === 0` rule.
- `createAtomFeedSource(config, pipelineAdapter?)` — a minimal hand-rolled
  Atom XML parser (`parseAtomFeed`) and sink routing (`pipeline` ->
  `RawItem[]` via adapter hook, `source_type: "oss"`; `calendar` ->
  `CalendarEntry[]`, nothing written). No XML-capable dependency existed in
  `package.json`; none was added — hand-rolled parsing covering the tested
  fixture shapes was judged sufficient for NLnet/Outreachy-shaped feeds.
- `buildSourceProposal(meta: SourceMeta): SourceProposal` — Engine 11
  admission scaffolding. `has_health_check`, `dedupe_compatible`,
  `survives_format_change` default `true` because the `Stage3Source`
  contract makes them true by construction; documented in the README as
  valid only inside that contract.
- 47 new fixture-based unit tests (`tests/health.test.ts`,
  `tests/company-board.test.ts`, `tests/github-repo.test.ts`,
  `tests/atom-feed.test.ts`, `tests/admission.test.ts`). Full suite: 600
  passing (45 files), up from a 553/40 baseline. Zero diff to the 12
  engines, the pipeline, persistence, prerank, or scope modules.

### Notes

- Zero LLM calls, zero Airtable, zero live network. Every test injects a
  fake `SourceDeps`.
- Not wired anywhere. Wave 3 builds concrete `company_board` platform
  adapters (Greenhouse, Lever, Workday, Ashby); Wave 4 builds concrete
  `github_repo`/`atom_feed` sources and the calendar writer; Wave 6 wires
  the orchestrator (real `SourceDeps`, the health-state loop, weekly-report
  surfacing of `auto_disabled` sources).
- `Atom` has no dedicated `IngestionType` value in Engine 11's existing enum
  (`"rss" | "api" | "email_alert" | "scrape"`) — Atom-family sources use
  `"rss"` when building their `SourceProposal`.
