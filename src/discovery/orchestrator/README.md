# Stage-3 Orchestrator

The run coordinator that turns nine built-but-inert Stage-3 sources into a
discovery layer that actually runs. This is the wave that **wires** things:
the prerank gate (Wave 0) gets its first live caller, health checks get
executed and persisted, and `oaos discover` grows a Stage-3 path.

```
source table → fetch → ┬─ calendarEntries ──────────→ calendar writer (D18)
                       └─ items → dedupe → prerank → runPipeline → Airtable
                       healthCheck → advanceHealth → discovery/health.json
```

## The one place real HTTP exists

`http.ts`'s `createSourceDeps()` is **the only place in the codebase that
constructs real HTTP for Stage-3.** Every source module takes `SourceDeps`
injected and imports no HTTP client of its own — the Wave 2 standing rule.
This file is the single wiring point that makes that rule payable.

If a source needs a capability `SourceDeps` does not expose, extend the
interface in the frame and wire it here. Do not import `fetch` in a source
module "just for one call."

## The source table (D14)

`sources.ts` declares all ten Stage-3 sources. **This is the file you edit to
activate a source.**

| row | family | sink |
|---|---|---|
| `greenhouse` `lever` `workday` `ashby` | company_board | pipeline |
| `esoc` `nlnet` `ghsl` | github_repo / atom_feed | pipeline |
| `cncf-lfx` `lfdt` `outreachy` | github_repo / atom_feed | **calendar** |

**Every row ships `enabled: false`.** Locked operator decision, 2026-07-28:
Wave 6 builds the *ability* to run; deciding what actually runs is Wave 8 and
is operator-paced. Nothing in this repo flips these for you, and
`sources.test.ts` guards the default — if that test fails, someone activated
a source.

Two independent toggle levels:

- **Family level** — the `enabled` flag on the row here. Governs
  `--all-enabled`.
- **Per company** — `enabled` on the entry in `stage3/registry.ts`. A company
  disabled there is skipped even when its platform row is on.

`--source <name>` deliberately **bypasses** the family toggle: naming a source
on the command line is itself the operator's activation gesture for that one
invocation. The toggle answers "what runs when I ask for everything", not
"what am I allowed to run".

### The registry slice is load-bearing

`boardEntry` gives each platform adapter **only its own registry entries**.
`createCompanyBoardSource` hands every entry it is given to `adapter.fetchOne`
without checking `entry.platform`, so passing the whole registry makes each
adapter fetch every other platform's company against its own API.
Live-caught 2026-07-28: the Ashby row fetched all six non-Ashby tokens and
collected five spurious 404s, which would have driven a healthy family toward
`auto_disabled` for no reason. `sources.test.ts` has a regression test that
drives every board row with a recording fake and asserts no foreign token is
requested. **Do not drop the filter.**

## The three Wave 6 rulings

### Q1 — Stage 3 runs the full pipeline

`fetch → normalize → prerank → runPipeline → persist`, one invocation.
Identical to the Stage-2 email path, so `oaos discover` stays one coherent
command, and it matches prerank's stated purpose (select top-K "so only
survivors spend Gemini budget"). Cost ceiling: `maxPerRun` 25 × ~4 Gemini
calls = 100 calls/run against a 500/day cap, ≈5 runs/day. `--dry-run` is the
inspect-before-spending path.

### Q2 — no `preferences.json`, no Stage 3

The orchestrator takes `vocabulary` as **injected data** — it never reads
preferences.json itself, so prerank's no-file-reads rule stays intact and
every test is disk-free. The CLI loads the file and **refuses to run** when it
is absent, pointing at `oaos setup-scope`.

There is deliberately no `DEFAULT_VOCABULARY` fallback. D15 makes
preferences.json the single source of truth for what discovery searches for;
falling back would mean searching a scope the operator never approved. The
refusal applies to `--dry-run` too — a preview computed from the wrong
vocabulary is a misleading preview.

`vocabulary.ts` maps `Preferences` → `PrerankVocabulary`. The mapping is
asymmetric because the schemas are: `domainTerms` come from the **enabled**
fields of preferences.json (the part D15 makes the operator confirm);
`roleTerms` and `negativeTerms` come from `DEFAULT_VOCABULARY`, because
preferences.json has no notion of either and extending its schema is a
scope-module change not taken in Wave 6.

**This wave never writes preferences.json.** It is read-only and optional-to-
absent, and the unforgeability pattern (see `scope/README.md`) still holds:
the confirmed `oaos setup-scope` path is its only legitimate producer.

### Q3 — health persists, and only the operator resumes a source

State lives in **`discovery/health.json`** — gitignored, operator-local,
sibling of `discovery/calendar.json`. Without persistence the
two-consecutive-failures rule could never fire, because every run would start
from a fresh healthy state.

- **Auto-disabled sources are probed, never fetched.** Each run runs their
  `healthCheck()` only. This is what makes `recoveredFromDisabled` live code
  rather than dead code: without a probe the orchestrator would never learn a
  source came back.
- **A clean probe reports recovery; it does not resume the source.** Recovery
  surfaces in the run summary and in `oaos report` as "needs `--reenable`".
- **`oaos discover --stage3 --reenable <name>`** is the only way out of
  `auto_disabled`. No hand-editing of state files — the same posture the repo
  takes with preferences.json.

## Invariants this module owns

1. **Per-source isolation.** A throw from `build()`, `fetch()`, or
   `healthCheck()` never aborts the run — it becomes a recorded error on that
   source's summary row. Wave 2 made partial failure a result *inside* a
   family; this holds the same line *across* families. A throw from
   `processItem` is isolated per item, so one bad write cannot strand the
   rest of a preranked batch.
2. **D18, enforced not assumed.** A `sink: "calendar"` row's `RawItems` are
   dropped and reported, so a source that starts emitting items after a
   format change cannot silently cross into the pipeline. Note `sink` governs
   **items only** — `calendarEntries` are routed to the writer from any
   source, since that direction cannot cross D18.
3. **A dry run persists nothing.** No pipeline run, no calendar write, no
   health write, not even a `health.set`.
4. **A corrupt health file fails loudly.** `health-store.ts` throws naming the
   path and the offending key, and never silently resets — a silent reset
   would re-enable every auto-disabled source without the operator ever
   learning a source had been failing. A *missing* file is not corruption: it
   means "no history yet".

## Prerank runs once per run, not per source

Its IDF weighting is defined over "the current run's full batch", and
`maxPerRun` is the run's Gemini budget, not a per-source quota. Passed and
gated counts are attributed back to the owning source by item identity
(prerank returns the same `RawItem` references it was given).

Within-run duplicates are collapsed by Engine 1's fingerprint **before**
preranking. This loses nothing — `writeOpportunity` dedupes on the same
fingerprint against Airtable anyway — it just stops duplicates from spending
Gemini budget first.

## CLI

```
oaos discover --stage3 --all-enabled [--dry-run]   # everything switched on
oaos discover --stage3 --source <name> [--dry-run] # one source, toggle bypassed
oaos discover --stage3 --reenable <name>           # clear health history
```

`--stage3` requires exactly **one** mode. A bare `--stage3` is refused rather
than defaulting to a full run: deciding what runs is the operator's call, and
a typo must not start one.

`oaos report` grows a Stage-3 source-health section — per-source status, the
last check's detail **verbatim**, and auto-disabled / recovered alerts with
the exact re-enable command. The section is omitted entirely (not shown empty)
when no Stage-3 run has ever happened.

## Testing

Every orchestrator test injects fake `SourceDeps`, a memory health store, a
fake calendar sink, and a fake `processItem`. **No network, no Airtable, no
Gemini, no disk** — the default `vitest run` stays network-free forever.

Live confirmation is manual and bounded, exactly as in Waves 3 and 4: flip a
row, run `--dry-run`, revert. It is never part of the automated suite.
