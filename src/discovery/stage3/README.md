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
are collected with `scope: "<platform>:<token>"`. Recruitee/Workable/Personio
are Wave 7.

**Concrete adapters (Wave 3)** — `src/discovery/stage3/adapters/`, one file
per platform, each a `CompanyBoardAdapter`:

- **Greenhouse** (`greenhouse.ts`) —
  `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. On a
  non-200 with `content=true`, falls back to the plain listing (no query
  param) and returns those items **silently** — no `SourceError` recorded.
  This is deliberate: `fetchOne` returns `Promise<RawItem[]>` only, with no
  channel to return successful items *and* a non-fatal warning at once, and
  the frame is frozen this wave. It's also the *correct* choice, not just a
  workaround — description-less items (from the plain listing) still carry
  their `url`, so Engine 1's completeness scoring flags them
  `needs_enrichment`, and the existing research/enrichment pipeline step
  fills the description in from the posting URL. The degradation
  self-corrects exactly where it matters; only a double failure (both
  `content=true` and plain) throws `kind: "http"`.
- **Lever** (`lever.ts`) — `GET api.lever.co/v0/postings/{token}?mode=json`.
  Response is a raw JSON array; `hostedUrl` per posting is the url.
- **Workday CXS** (`workday.ts`) —
  `POST {base}/wday/cxs/{tenant}/{site}/jobs`, paginated by `offset`/`limit`
  (20/page) until `total` is collected, capped at a hard safety ceiling of
  500 (hitting the ceiling before `total` is collected throws
  `kind: "shape"`, noting truncation — no partial items returned). Missing
  `site` on the registry entry throws `kind: "shape"` before any request.
  `CompanyRegistryEntry` has no field for the per-tenant `wd{N}` subdomain
  (frame frozen), so `workday.ts` keeps its own small `TENANT_BASE_URL`
  lookup (currently just `redhat`) — analogous to Greenhouse/Lever
  hardcoding their own API host. **URL construction is
  `${base}/${site}${externalPath}`** — live-verified: this form resolves
  200/no redirect against a real Red Hat posting; the site-less form
  `${base}${externalPath}` 404s. Don't drop the `/${site}/` segment.
- **Ashby** (`ashby.ts`) —
  `GET api.ashbyhq.com/posting-api/job-board/{token}`. The public board page
  (`jobs.ashbyhq.com/{token}`) is a client-rendered SPA that doesn't expose
  its data-fetch URL statically, so this uses Ashby's documented no-auth
  public Job Board API instead; confirmed live against `signoz` and
  `hashgraph`. `jobUrl` (fallback `applyUrl`) per job is the url.

`src/discovery/stage3/registry.ts` holds the locked Phase 1
`COMPANY_REGISTRY` (exactly 8 entries — see CHANGELOG for the list) and
`PLATFORM_SOURCE_META` (one `SourceMeta` per platform feeding
`buildSourceProposal`). All four are `ingestion_method: "api"` — Workday's
classification as `"api"` (not `"scrape"`) is a locked operator decision,
2026-07-20.

### `github_repo`

`createGitHubRepoSource(config: RepoSourceConfig, adapter: RepoAdapter, tokenProvider?)`.
Builds the Contents API URL and optional `Authorization` header, parses the
directory listing (non-200 -> `kind: "http"`; unexpected JSON shape ->
`kind: "shape"`), then hands entries to `adapter.interpretEntries(entries,
config, deps)`. The `deps` parameter was added in Wave 4 (see "Frame
extensions" below).

**Concrete sources (Wave 4)** — `src/discovery/stage3/sources/`:

- **ESoC** (`esoc.ts`) — a real `RepoAdapter` over
  `european-summer-of-code/esoc2026`'s `cards/` directory. Each `.md` file
  is one project card; `gcos-esoc2026-batches.md` (a schedule index) is
  excluded by filename pattern. No content fetch — same self-correcting
  `needs_enrichment` pattern as Wave 3's Greenhouse fallback. Repo name is
  config (next cohort's rename is a one-line change).
- **CNCF LFX Mentorship** (`cncf-lfx.ts`) — **calendar-tracked, not a
  `RepoAdapter`.** The original plan assumed
  `programs/lfx-mentorship/{year}` listed per-project entries directly;
  live verification found both the concluded and active 2026 terms contain
  only an empty `project_ideas.md` template pointing at the external
  mentorship.lfx.linuxfoundation.org platform (the real source of truth,
  out of scope this wave). Routed to the calendar sink instead: one
  reminder entry per term. `year` is config, same convention as LFDT.
- **LFDT** (`lfdt.ts`) — **calendar-tracked, not a `RepoAdapter`.**
  `docs/projects/{year}.md` is a real 29-project markdown table, but this
  frame only ever fetches one directory listing's *metadata* — it cannot
  reach file content, and the Contents API rejects a single-file path
  outright (object, not array — a shape error by design). Calendar-tracked
  per operator ruling rather than extending the frame a second time this
  wave. `year` is config, same convention as CNCF.

Both CNCF and LFDT reuse `FetchResult.calendarEntries` — originally
documented as populated "only by atom_feed sources routed to the calendar
sink" — for a `github_repo`-family source instead. This is a deliberate,
non-breaking reuse (the field is optional and not type-restricted to one
family); no frame file was modified to allow it.

### `atom_feed`

`createAtomFeedSource(config: FeedSourceConfig, pipelineAdapter?)`. Parses
Atom XML with a **minimal hand-rolled parser** — no XML-capable dependency
exists in `package.json`, and none was added (NLnet/Outreachy/GHSL are
simple, well-formed feeds; a hand-rolled parser covering the tested fixture
cases is the right cost — a real feed that breaks it is a contained fix, not
a redesign). Per-entry shape failures (missing required `id`/`title`) are
recorded and skipped, never thrown; a missing `<feed>` root is a
whole-document parse error. Sink routing:

- `sink: "pipeline"` -> entries go through `FeedPipelineAdapter.toRawItem(entry,
  config, deps)` into `RawItem[]` (`source_type: "oss"`).
- `sink: "calendar"` -> `FetchResult.items` is `[]`; `FetchResult.calendarEntries`
  is populated instead. The uniform `fetch(): Promise<FetchResult>` contract
  is preserved for every family — `calendarEntries` is an optional field on
  the one shared result type, not a different return shape for this family.

**Concrete sources (Wave 4)** — `src/discovery/stage3/sources/`:

- **NLnet** (`nlnet.ts`) — `https://nlnet.nl/feed.atom`, pipeline sink.
  Confirmed live: 342 entries, 0 parse errors, a genuine mix of grant-award
  announcements and general posts. The adapter does not classify or
  filter — every entry becomes a `RawItem`; prerank and the pipeline sort
  relevance downstream.
- **Outreachy** (`outreachy.ts`) — `https://www.outreachy.org/blog/feed/`,
  **calendar sink only (D18)**: nothing from this source ever enters the
  opportunity pipeline. Confirmed live: 43 entries, 0 errors, cohort timing
  present directly in entry titles.
- **GHSL** (GitHub Security Lab) (`ghsl.ts`) — `https://securitylab.github.com/feed.xml`,
  pipeline sink, built on an explicit operator override (see "Documented
  rejects" — GSoC was rejected the same wave for a structurally different
  reason). Confirmed live: valid, well-formed Atom, currently zero `<entry>`
  elements — a verified mechanism with dormant content, not a broken
  source. Sits idle at near-zero cost until GitHub Security Lab publishes,
  then flows automatically; same content-agnostic mapping as NLnet.

### Frame extensions (Wave 4)

`RepoAdapter.interpretEntries` and `FeedPipelineAdapter.toRawItem` each
gained a third `deps: SourceDeps` parameter. Neither hook had ever been
called by a concrete source before this wave (Wave 3 only built
`company_board`), so the inability to read `deps.now()` for a real fetch
timestamp was a latent Wave 2 gap, not a Wave 4 regression — `RawItem
.fetched_at` directly feeds `normalize.ts`'s fingerprint-id generation and
`date_found`, so it must be a real timestamp, never a placeholder. Backward
compatible in TypeScript (a function value with fewer declared params is
structurally assignable to a type requiring more); verified empirically by
re-running the pre-existing `github-repo.test.ts` / `atom-feed.test.ts`
unmodified after each change.

## Calendar sink (decision D18)

`src/discovery/stage3/calendar-writer.ts` — `writeCalendarEntries(entries,
path?)`. **This is the first Wave where a source's output deliberately does
NOT enter the opportunity pipeline.** `CalendarEntry[]` (from any source's
`FetchResult.calendarEntries`) is upserted into a JSON object keyed by
`url`, falling back to `title` when `url` is null/empty; an entry with
*both* missing is refused (recorded, never written) rather than inventing
an index- or hash-based key that would silently duplicate on reorder.
Output is sorted-by-key, pretty-printed JSON at `discovery/calendar.json`
(the default `CALENDAR_PATH`) — **gitignored, operator-local state, read by
humans only, never by `runPipeline`.** If proper id-keying is ever wanted,
that's a deliberate future change to `CalendarEntry` itself, taken on its
own merits, not a workaround here.

## Documented rejects

- **GSoC** (2026-07-21) — the target repo/org this wave's plan assumed does
  not exist under any live-verified URL variant tried within the bounded
  Step-1 verification budget. Rejected: no source built, no fixture, no
  `SourceMeta` entry. Contrast GHSL below, whose feed mechanism does exist
  and is merely dormant — a structurally different finding that led to the
  opposite ruling.

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
| `adapters/greenhouse.ts` | `greenhouseAdapter` — Greenhouse `CompanyBoardAdapter` |
| `adapters/lever.ts` | `leverAdapter` — Lever `CompanyBoardAdapter` |
| `adapters/workday.ts` | `workdayAdapter` — Workday CXS `CompanyBoardAdapter` |
| `adapters/ashby.ts` | `ashbyAdapter` — Ashby `CompanyBoardAdapter` |
| `registry.ts` | `COMPANY_REGISTRY` (locked, 8 entries), `PLATFORM_SOURCE_META` |
| `github-repo.ts` | `buildContentsApiUrl`, `buildAuthHeader`, `parseContentsResponse`, `createGitHubRepoSource` |
| `atom-feed.ts` | `parseAtomFeed`, `mapFeedEntriesToCalendar`, `createAtomFeedSource` |
| `admission.ts` | `buildSourceProposal` |
| `calendar-writer.ts` | `writeCalendarEntries`, `CALENDAR_PATH` (D18) |
| `sources/esoc.ts` | `esocAdapter`, `ESOC_CONFIG`, `createEsocSource` |
| `sources/cncf-lfx.ts` | `createCncfLfxSource`, `CNCF_LFX_CONFIG` (calendar-tracked) |
| `sources/lfdt.ts` | `createLfdtSource`, `LFDT_CONFIG` (calendar-tracked) |
| `sources/nlnet.ts` | `nlnetAdapter`, `NLNET_CONFIG`, `createNlnetSource` |
| `sources/outreachy.ts` | `createOutreachySource`, `OUTREACHY_CONFIG` (calendar sink only, D18) |
| `sources/ghsl.ts` | `ghslAdapter`, `GHSL_CONFIG`, `createGhslSource` |
| `sources/meta.ts` | `WAVE4_SOURCE_META` |
| `sources/himalayas.ts` | `createHimalayasSource`, `HIMALAYAS_CONFIG` |
| `sources/freehire.ts` | `createFreehireSource`, `FREEHIRE_CONFIG` (quarantined) |
| `sources/adzuna.ts` | `createAdzunaSource`, `ADZUNA_CONFIG` (quarantined, auth) |
| `sources/remotive.ts` | `createRemotiveSource`, `REMOTIVE_CONFIG`, `remotiveUrl` |
| `sources/hn-hiring.ts` | `createHnHiringSource`, `HN_CONFIG`, `threadSearchUrl` |
| `sources/meta-wave5.ts` | `WAVE5_SOURCE_META` |
| `query/scope-terms.ts` | `deriveQueryTerms`, `cappedTermsError`, `MAX_QUERY_TERMS` |
| `query/truncation.ts` | `quarantineContent`, `ADAPTER_CONTENT_KEYS`, `QuarantineError` |
| `query/hn-prefilter.ts` | `prefilterComments`, `liftCompany`, `decodeCommentText` |
| `query/remotive-state.ts` | `createRemotiveStore`, `parseRemotiveState`, `utcDay` |
| `query/http-json.ts` | `getJson`, `readArray`, `isRecord`, `str` |
| `index.ts` | Public surface |
| `tests/` | Fixture-based, fake `SourceDeps` — zero network |

## The `query_net` family (Wave 5)

Five sources that build their requests from the operator's CONFIRMED
discovery scope (`preferences.json`, D15). They are single-config, so they
take the strict `ok: errors.length === 0` healthCheck rule — not
`company_board`'s partial-failure rule.

**Per-source query strategy is deliberate, not an oversight.** These APIs
differ enough that one uniform query builder would serve none of them well:

| Source | Strategy | Requests/run at 13 fields |
|---|---|---|
| `himalayas` | one `?q=<term>` search per enabled field; no pagination exists | 13 + 1 probe |
| `freehire` | one `?q=<term>&work_mode=remote&limit=20` per field | 13 + 1 probe |
| `adzuna` | one `?what=<term> remote&sort_by=date&max_days_old=14` per field | 13 + 1 probe |
| `remotive` | no query — the API has none. One call, hard-capped per UTC day | 1 + 0 |
| `hn-hiring` | two fixed requests; scope drives the prefilter, not the request | 2 + 1 |

**Caps (operator ruling):** `MAX_QUERY_TERMS = 15` with dropped terms
REPORTED as a `SourceError`; one page per query, always; page size 20 so no
single source dominates a mixed prerank batch.

**`family` is descriptive, never load-bearing.** Nothing in this codebase
switches or dispatches on it — it is carried into `SourceRunSummary` and
printed in the weekly report. That is why adding `"query_net"` was a safe
additive change. If dispatch keyed on `family` is ever introduced, this stops
being true and every existing member needs auditing.

## Not wired yet

The Wave 3 `company_board` adapters + registry and the Wave 4
`github_repo`/`atom_feed` sources exist as importable modules only —
`index.ts` does not re-export them. Wave 6 wired the ORCHESTRATOR, which
constructs every source (including Wave 5's) from
`src/discovery/orchestrator/sources.ts`. **Every row in that table ships
`enabled: false`** — activating a source is Wave 8 and operator-paced.

## Live-verification script (`scripts/live-verify.ts`)

A one-request-per-platform bounded live check for the four Wave 3 adapters
— not part of the automated suite, run manually:
`npx tsx src/discovery/stage3/scripts/live-verify.ts`.

**Standing invariant:** it's excluded from `vitest run` purely by filename
— it doesn't match the default test glob (`**/*.{test,spec}.*`), and there
is no `vitest.config.ts` in the repo to special-case. If a
`vitest.config.ts` is ever added, or the include glob is ever widened, this
exclusion must be preserved explicitly. The default suite must stay
network-free forever.
