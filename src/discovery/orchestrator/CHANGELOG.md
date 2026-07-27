# Changelog — Stage-3 Orchestrator

## [0.1.0] — 2026-07-28

Initial implementation. Wave 6 of OAOS Phase 1 — the first wave that wires
anything. Nine built-but-inert Stage-3 sources become runnable: the prerank
gate (Wave 0) gets its first live caller, health checks get executed and
persisted, and `oaos discover` grows a Stage-3 path. Nothing is admitted or
activated — every source table row ships `enabled: false`.

### Added

- `src/discovery/orchestrator/orchestrator.ts` — `runStage3(deps)`, the run
  coordinator. Iterates selected source rows, fetches each, routes calendar
  entries to the calendar writer and pipeline items to the prerank gate, hands
  survivors to the full pipeline, advances and persists health state, and
  returns one run summary. Every side effect is injected, so the whole
  coordinator is exercised with fakes — no network, Airtable, Gemini, or disk.
  Also `reenableSource(name, health)`.
- `src/discovery/orchestrator/sources.ts` — **the Stage-3 source table (D14)**,
  ten rows: four company_board platforms, `esoc`/`nlnet`/`ghsl` to the
  pipeline, `cncf-lfx`/`lfdt`/`outreachy` to the calendar sink. The file the
  operator edits to activate a source. Every row ships `enabled: false`
  (locked operator decision, 2026-07-28) — Wave 6 builds the ability to run;
  what actually runs is Wave 8.
- `src/discovery/orchestrator/http.ts` — `createSourceDeps()`, **the only
  place in the codebase that constructs real HTTP for Stage-3**. 20s
  per-request timeout so a hung endpoint cannot hang a run.
- `src/discovery/orchestrator/health-store.ts` — `discovery/health.json`
  persistence (gitignored, operator-local, sibling of `calendar.json`).
  Strict parse that throws naming the path and the offending key; never a
  silent reset. A missing file is not corruption — it starts empty and is
  created on flush. `createMemoryHealthStore` shares one get/set/all
  implementation with the disk-backed store.
- `src/discovery/orchestrator/vocabulary.ts` — `preferencesToVocabulary`,
  pure `Preferences` → `PrerankVocabulary` mapping.
- `cli/commands/stage3.ts` — `oaos discover --stage3` with
  `--all-enabled` / `--source <name>` / `--reenable <name>` / `--dry-run`.
  `parseStage3Args` and `selectEntries` are pure and unit-tested.
- `cli/format.ts` — `formatStage3Summary` (per-source fetched / calendar /
  deduped / prerank passed / gated / written / health, plus prerank totals,
  errors attributed by source, and auto-disabled / recovered alerts carrying
  the exact re-enable command), and a Stage-3 health section in
  `formatReport`.
- `.gitignore` — `discovery/health.json`.
- 85 new tests across 5 files (orchestrator, health-store, sources,
  vocabulary, cli/stage3). Full suite 747 green (63 files).

### Operator rulings recorded this wave

- **Q1 — Stage 3 runs the full pipeline in one invocation**, matching the
  Stage-2 path. `--dry-run` is the inspect-before-spending escape hatch.
- **Q2 — no `preferences.json`, no Stage 3.** No `DEFAULT_VOCABULARY`
  fallback: D15 makes preferences.json the single source of truth for what
  discovery searches for. The refusal applies to `--dry-run` too. The
  orchestrator still takes `vocabulary` as injected data; the CLI does the
  loading and the refusing.
- **Q3 — health persists to `discovery/health.json`; only the operator
  resumes a source.** Auto-disabled sources are probed with `healthCheck()`
  and never fetched, so recovery is detectable; recovery is reported but never
  resumes anything. `--reenable <name>` is the sole exit from `auto_disabled`.

### Changed

- `cli/commands/discover.ts` — a `--stage3` branch at the top of
  `runDiscoverCommand`. The Stage-2 email-alert path is unchanged.
- `cli/commands/report.ts` — reads `discovery/health.json` for the report's
  health section. A corrupt file is **not** swallowed here: the store throws
  and the report fails loudly rather than reporting "all healthy" from a file
  it could not read.
- `cli/index.ts` — help text for the three Stage-3 forms.

### Fixed

- `boardEntry` passed the **entire 8-entry `COMPANY_REGISTRY`** to every
  platform adapter. `createCompanyBoardSource` hands each entry to
  `adapter.fetchOne` without checking `entry.platform`, so every adapter
  fetched every other platform's company against its own API. Live-caught
  during the Step-2 bounded dry-run, 2026-07-28: the Ashby row fetched all six
  non-Ashby tokens and collected five spurious 404 `SourceError`s — enough to
  drive a healthy family toward `auto_disabled` over two runs. Fixed by
  slicing the registry per platform, with a regression test that drives every
  board row with a recording fake and asserts no foreign token is requested.

### Notes / findings not acted on

- **ClickHouse appears to run an Ashby board.** Only five of the six foreign
  tokens 404'd during the buggy first run; `clickhouse` returned a live Ashby
  board of ~171 postings. ClickHouse is registered as `greenhouse`. A registry
  question for Wave 7/8 — `registry.ts` was not touched.
- **NLnet dedupes ~52% of its feed** (179 of 342 items collapsed to 163
  fingerprints). The fingerprint is `sha1(company|role|url-host)` and every
  NLnet item shares the `nlnet.nl` host, so Engine 1 is extracting only 163
  distinct company/role pairs from 342 entries. This costs nothing — Airtable
  would merge the same items at write time — but suggests the feed adapter
  isn't extracting distinct identity for NLnet content. An Engine 1 / Wave 4
  question, out of Wave 6 scope. Also worth knowing before activation: 342
  items is a full-site feed, so at `maxPerRun: 25` NLnet alone would dominate
  a run's budget.

### Live verification (bounded, per the network policy)

`ashby` + `nlnet` flipped on temporarily, one `--dry-run` invocation, both
rows reverted. Ashby 17 fetched → 13 passed / 4 gated; NLnet 342 fetched →
179 deduped → 12 passed / 151 gated; prerank 180 in → 25 passed, 155 gated
(location 4, below_floor 107, beyond_k 44). Zero errors, both sources healthy.
`discovery/` was not created — no health or calendar write — and
`preferences.json` was untouched.

The mixed two-family batch confirmed IDF behaves as designed: ashby was 9% of
the batch but took 13 of the 25 passed slots, so the weighting concentrated
budget on the relevant minority instead of letting a 163-item feed win on
volume. The homogeneous-batch fallback correctly did not trigger.

### Not done here

- No source is admitted or activated (Wave 8).
- No query-net sources (Wave 5), no registry expansion (Wave 7).
- No engine, pipeline, persistence, prerank, scope, or Stage-3
  frame/source/adapter file was modified.
