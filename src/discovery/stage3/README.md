# Stage-3 Source Families

The shared core three Stage-3 source families hang off: one uniform
`Stage3Source` surface (`fetch` + `healthCheck`), a shared health state
machine, and the per-family config/adapter shapes for `company_board`,
`github_repo`, and `atom_feed`.

**This session builds frames only.** No concrete source (no real company
token, program name, or feed URL outside fixtures/docs), no live network
call, no wiring into `oaos discover`. That is Waves 3-6.

## The common contract

```typescript
interface Stage3Source {
  name: string;
  family: "company_board" | "github_repo" | "atom_feed";
  enabled: boolean;                     // D14 toggle, from config — never hardcoded
  fetch(deps: SourceDeps): Promise<FetchResult>;
  healthCheck(deps: SourceDeps): Promise<HealthCheckResult>;
}
```

`SourceDeps` (`httpGet`, `httpPost`, `now`) is injected — **no module in this
tree imports `fetch`/`http` directly.** Real HTTP is wired in Wave 6; every
test here injects a fake. This is how "zero live network this session" and
"testable forever" are both true at once.

`FetchResult.errors` makes partial failure a *result*, never a thrown
total-stop — one bad registry entry or feed entry degrades, the rest still
flow. This is Engine 11's `survives_format_change` made structural.

## Health check contract and state machine

```typescript
interface HealthCheckResult { ok: boolean; checkedAt: string; detail: string }

interface SourceHealthState {
  source: string;
  consecutiveFailures: number;          // capped at MAX_CONSECUTIVE_FAILURES (2)
  status: "healthy" | "probation" | "auto_disabled";
  lastResult: HealthCheckResult | null;
  recoveredFromDisabled: boolean;       // true for exactly one advance after recovery
}

function advanceHealth(state: SourceHealthState, result: HealthCheckResult): SourceHealthState
```

One failure -> `probation`. Two **consecutive** failures -> `auto_disabled`
(Wave 6 skips the source and surfaces it in the weekly report: "fall back to
Stage-1 manual for that source"). Any success resets to `healthy`, including
recovery from `auto_disabled` — that transition alone sets
`recoveredFromDisabled: true` so the orchestrator can require a manual
re-enable rather than silently resuming; the flag clears on the very next
advance. Pure, deterministic, exhaustively tested (`tests/health.test.ts`,
all 8 transitions).

### healthCheck semantics differ by family — and that is deliberate

- **`company_board` is family-level, not per-entry.** A registry might hold
  four companies; if one token rots, `fetch()` correctly returns three
  companies' items plus one scoped error — per-entry isolation working as
  designed. If `healthCheck` called that "not ok", two such runs would
  auto-disable the *entire platform*, killing three healthy companies over
  one bad token — inverting the point of per-entry isolation. So
  `company_board.healthCheck` reports `ok: false` **only when every enabled
  registry entry failed**; partial failure is `ok: true` with the degraded
  entries named in `detail` (which goes into the weekly report verbatim —
  the operator sees "greenhouse:tailscale needs attention" without the
  family dying).
- **`github_repo` and `atom_feed` are single-config sources** — one owner/repo
  or one feed URL. There is no "partial" for a single config, so any error
  is total failure: `ok: errors.length === 0`.

## Family interfaces

### `company_board`

`createCompanyBoardSource(adapter: CompanyBoardAdapter, registry: CompanyRegistryEntry[], enabled = true)`.
The registry loop skips disabled entries, calls `adapter.fetchOne` per entry,
and never lets one entry's throw or garbage return stop the others — errors
are collected with `scope: "<platform>:<token>"`. Concrete platform adapters
(Greenhouse, Lever, Workday, Ashby) are Wave 3; Recruitee/Workable/Personio
are Wave 7.

### `github_repo`

`createGitHubRepoSource(config: RepoSourceConfig, adapter: RepoAdapter, tokenProvider?)`.
Builds the Contents API URL and optional `Authorization` header, parses the
directory listing (non-200 -> `kind: "http"`; unexpected JSON shape ->
`kind: "shape"`), then hands entries to `adapter.interpretEntries`. Per-program
interpretation (CNCF LFX, ESoC, LFDT) is Wave 4.

### `atom_feed`

`createAtomFeedSource(config: FeedSourceConfig, pipelineAdapter?)`. Parses
Atom XML with a **minimal hand-rolled parser** — no XML-capable dependency
exists in `package.json`, and none was added this session (NLnet/Outreachy
are simple, well-formed feeds; a hand-rolled parser covering the tested
fixture cases is the right cost — a real Wave 4 feed that breaks it is a
contained fix, not a redesign). Per-entry shape failures (missing required
`id`/`title`) are recorded and skipped, never thrown; a missing `<feed>` root
is a whole-document parse error. Sink routing:

- `sink: "pipeline"` -> entries go through `FeedPipelineAdapter.toRawItem` into
  `RawItem[]` (`source_type: "oss"`). NLnet, Wave 4.
- `sink: "calendar"` -> `FetchResult.items` is `[]`; `FetchResult.calendarEntries`
  is populated instead. Outreachy, Wave 4's calendar writer. The uniform
  `fetch(): Promise<FetchResult>` contract is preserved for every family —
  `calendarEntries` is an optional field on the one shared result type, not a
  different return shape for this family.

## Engine 11 admission scaffolding

`buildSourceProposal(meta: SourceMeta): SourceProposal` maps a source
module's declared metadata into Engine 11's *existing* `SourceProposal` type
— imported, never redefined. `has_health_check`, `dedupe_compatible`, and
`survives_format_change` default to `true` because the `Stage3Source`
contract makes them true by construction (every source has `healthCheck()`;
`FetchResult.errors` structurally guarantees format-change survival).

**That default is only valid inside this contract.** Any future source built
*outside* `Stage3Source` (a one-off script, a manual import path) must not
call `buildSourceProposal` and inherit those defaults for free — it has not
earned them. Set the three booleans by hand in that case.

`ingestion_method` uses Engine 11's existing `IngestionType` enum
(`"rss" | "api" | "email_alert" | "scrape"`), which has no dedicated "atom"
value — Atom-family sources use `"rss"`.

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | `Stage3Source`, `SourceDeps`, health-machine types, per-family config/adapter shapes. Imports `RawItem` and Engine 11 types; never redefines them. |
| `config.ts` | `MAX_CONSECUTIVE_FAILURES` |
| `health.ts` | `createHealthState`, `advanceHealth` |
| `company-board.ts` | `createCompanyBoardSource`, `SourceFetchError` |
| `github-repo.ts` | `buildContentsApiUrl`, `buildAuthHeader`, `parseContentsResponse`, `createGitHubRepoSource` |
| `atom-feed.ts` | `parseAtomFeed`, `mapFeedEntriesToCalendar`, `createAtomFeedSource` |
| `admission.ts` | `buildSourceProposal` |
| `index.ts` | Public surface |
| `tests/` | Fixture-based, fake `SourceDeps` — zero network |

## Not wired yet

No Stage3Source is constructed with real config anywhere in this repo. Wave
3 builds concrete `company_board` platform adapters; Wave 4 builds
`github_repo` and `atom_feed` concrete sources plus the calendar writer;
Wave 6 wires the orchestrator (real `SourceDeps`, the health-state loop
driving `advanceHealth`, and the weekly-report surfacing of `auto_disabled`
sources).
