# Changelog — Stage-3 Source Families

## [0.3.0] — 2026-07-21

Wave 4 of OAOS Phase 1 — the two remaining `github_repo`/`atom_feed` concrete
sources planned for this wave that turned out fit for the pipeline (ESoC,
NLnet), two that were re-routed to a new calendar sink after live reality
diverged from the original plan (CNCF LFX, LFDT), one built despite zero
current volume on an explicit operator override (GHSL), one built and then
immediately calendar-routed by original design (Outreachy), the calendar
writer itself (decision D18), and a resolved-not-deferred verification
(GSoC — documented reject, see README). Two Wave 2 frame interfaces were
extended (additive, non-breaking); the rest of the frame is untouched.

### Added

- `src/discovery/stage3/sources/esoc.ts` — real `RepoAdapter` for
  `european-summer-of-code/esoc2026`'s `cards/` directory. Each `.md` file
  under `cards/` is one project-proposal card; `gcos-esoc2026-batches.md` (a
  schedule index, not a project) is excluded by a filename pattern. No
  content fetch — same self-correcting `needs_enrichment` pattern as the
  Wave 3 Greenhouse fallback. Repo name (`esoc2026`) is config, not hardcoded
  logic, so next year's repo rename is a one-line change.
- `src/discovery/stage3/sources/nlnet.ts` — real `FeedPipelineAdapter` for
  `https://nlnet.nl/feed.atom` (pipeline sink). Confirmed live: 342 entries,
  0 parse errors, a genuine mix of grant-award announcements and general
  posts. The adapter does not classify or filter by type — every entry
  becomes a `RawItem`; prerank and the pipeline sort relevance downstream.
- `src/discovery/stage3/sources/outreachy.ts` — `https://www.outreachy.org/blog/feed/`,
  **calendar sink only** (D18: nothing from this source ever enters the
  opportunity pipeline). Confirmed live: 43 entries, 0 errors, cohort timing
  present directly in entry titles; `content` is null on every sampled entry.
- `src/discovery/stage3/sources/ghsl.ts` — real `FeedPipelineAdapter` for
  `https://securitylab.github.com/feed.xml` (pipeline sink), built on an
  explicit operator override of the initial "reject, no content" read.
  Confirmed live: valid, well-formed Atom (correct namespace/generator),
  currently zero `<entry>` elements — a verified mechanism with dormant
  content, not a broken source. Sits idle at near-zero cost
  (`est_maint_min_per_week: 1`, `est_volume_per_week: 0`, both honest about
  current state) until GitHub Security Lab publishes, then flows
  automatically — same content-agnostic mapping as NLnet.
- `src/discovery/stage3/sources/cncf-lfx.ts` — bespoke `Stage3Source`
  (`family: "github_repo"`, does not use `RepoAdapter`), **calendar-tracked,
  not parsed into RawItems.** Original plan assumed
  `programs/lfx-mentorship/{year}` listed per-project entries directly;
  live verification found both the concluded `01-Mar-May/2026` term and the
  active `02-Jun-Aug/2026` term contain only an empty `project_ideas.md`
  template pointing contributors at the external
  mentorship.lfx.linuxfoundation.org platform — the real source of truth,
  out of scope this wave. One calendar reminder entry per term instead.
  `year` is config (2026 -> 2027 rollover is a one-line change). Reuses
  `FetchResult.calendarEntries` beyond its original Wave 2 doc comment
  ("populated only by atom_feed sources") — a deliberate, non-breaking
  reuse; no frame file modified to do this.
- `src/discovery/stage3/sources/lfdt.ts` — bespoke `Stage3Source` (same
  pattern as CNCF), **calendar-tracked, not parsed into RawItems.** Live
  verification found `docs/projects/{year}.md` is a real, well-structured
  29-project markdown table — but the Wave 2 `github_repo` frame only ever
  fetches one directory listing's *metadata* (name/path/sha, no content),
  and the Contents API rejects a single-file path outright (object, not
  array — a shape error by the frame's own `parseContentsResponse` design).
  Reaching the table's content would require either a frame extension or an
  out-of-frame content fetch; the operator's ruling was calendar-track
  instead of either. One reminder entry pointing at the year's file. `year`
  is config, same convention as CNCF.
- `src/discovery/stage3/calendar-writer.ts` — decision D18's writer.
  `writeCalendarEntries(entries, path?)` upserts into a JSON object keyed by
  `url`, falling back to `title` when `url` is null/empty; an entry with
  **both** missing is refused (recorded in `CalendarWriteResult.refused`,
  never written) rather than inventing an index- or hash-based key that
  would silently duplicate on reorder. Output is sorted-by-key, pretty-
  printed JSON; directory created if missing. Path defaults to
  `discovery/calendar.json` (gitignored, operator-local — see `.gitignore`).
- `src/discovery/stage3/sources/meta.ts` — `WAVE4_SOURCE_META`, one
  `SourceMeta` per Wave 4 source feeding `buildSourceProposal`, same
  convention as Wave 3's `registry.ts::PLATFORM_SOURCE_META`.
  `est_volume_per_week` is honestly `0` for `cncf-lfx`/`lfdt` (calendar-
  tracked, never produce RawItems) and for `ghsl` (mechanism verified,
  content currently dormant) — each carries a `justification` string
  explaining why 0 is correct, not broken.
- **Frame extension (additive, operator-approved both times):**
  `RepoAdapter.interpretEntries` and `FeedPipelineAdapter.toRawItem` each
  gained a third `deps: SourceDeps` parameter. Neither hook had ever been
  called by a concrete source before this wave (Wave 3 only built
  `company_board`), so the missing ability to read `deps.now()` for a real
  fetch timestamp was a latent Wave 2 gap, not a Wave 4 regression. Backward
  compatible in TypeScript (a function value declared with fewer params is
  structurally assignable to a type requiring more) — verified empirically:
  the pre-existing `github-repo.test.ts` (12 tests) and `atom-feed.test.ts`
  (11 tests) both pass unmodified. `github-repo.ts`'s and `atom-feed.ts`'s
  call sites updated to pass `deps` through.
- **Documented reject: GSoC.** The target repo/org this wave's plan assumed
  does not exist under any live-verified URL variant tried within the
  bounded Step-1 budget. Operator ruling: reject, no source built. See
  README's "Documented rejects" section.
- 47 new tests across 8 files (`esoc`, `cncf-lfx`, `lfdt`, `nlnet`,
  `outreachy`, `ghsl`, `calendar-writer`, `wave4-admission`): fixture-based
  RawItem/CalendarEntry mapping, empty-directory and missing-file survival
  (LFDT's missing-year-file case emits a `shape` error, never a silent empty
  result), the D18 boundary as an executable assertion
  (`expect(result.items).toEqual([])` for Outreachy, CNCF, LFDT), GHSL's
  verified-mechanism/dormant-content state (0 items + 0 errors = healthy,
  not failing), calendar-writer create/update/preserve-unrelated/pretty-JSON/
  sorted-keys/refuse-on-unkeyable, and all 6 Wave 4 admission proposals
  passing individually plus cumulatively with Wave 3's 4 platforms (19
  min/week total, well under the 50 min/week global budget). Full suite:
  662 passing (58 files), up from the 631/50 baseline. Zero diff to the 12
  engines, pipeline, persistence, prerank, scope, or Wave 3's adapters/
  registry.
- `src/discovery/stage3/scripts/verify-wave4.ts` — Step 1 throwaway
  bounded-verification tool (one fetch + one 5xx-retry per URL/mode
  argument); kept permanently, same exclusion convention as Wave 3's
  `live-verify.ts` (see Notes).
- `src/discovery/stage3/scripts/live-verify-wave4.ts` — Step 2 bounded live-
  confirmation script, one real `.fetch(deps)` call per Wave 4 source (6
  total), one retry-on-throw; not part of the automated suite (see Notes).

### Notes

- Zero LLM calls, zero Airtable, zero CLI wiring this wave.
  `src/discovery/stage3/index.ts`'s public surface is untouched — none of
  the six sources are constructed with real config anywhere except the two
  manual verification scripts; Wave 6 wires the orchestrator.
- Live-verified (bounded, Step 2): all 6 sources' real `.fetch(deps)` output
  matched Step 1 findings exactly, including GHSL's 0 items / 0 errors
  (confirming "dormant, not broken") and both calendar sources' term/file
  discovery.
- `discovery/calendar.json` is gitignored — operator-local state, read by
  humans, never by `runPipeline`. See `.gitignore`.
- `verify-wave4.ts` and `live-verify-wave4.ts` are excluded from `vitest run`
  purely by filename (same standing invariant as Wave 3's `live-verify.ts`
  — neither matches the default test glob, and there's no
  `vitest.config.ts` to special-case). If one is ever added, or the glob
  widened, this exclusion must be preserved explicitly.

## [0.2.0] — 2026-07-20

Wave 3 of OAOS Phase 1 — the four concrete `company_board` platform adapters
(Greenhouse, Lever, Workday CXS, Ashby) plus the locked Phase 1 company
registry, on the Wave 2 `Stage3Source` / `CompanyBoardAdapter` frame. First
live callers of the frame; frame itself untouched.

### Added

- `src/discovery/stage3/adapters/greenhouse.ts` —
  `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. On a
  non-200 with `content=true`, falls back to the plain listing (no query
  param) for that entry and returns its items **silently** — no `SourceError`
  is recorded. This is deliberate, not an oversight: `CompanyBoardAdapter
  .fetchOne` returns `Promise<RawItem[]>` only, with no channel to return
  successful items *and* a non-fatal warning at once, and the frame is frozen
  this wave. Description-less items (from the plain listing) still carry
  their `url`, so Engine 1's completeness scoring flags them
  `needs_enrichment` and the existing research/enrichment pipeline step
  fills the description from the posting URL — the degradation self-corrects
  downstream instead of needing an error side-channel the frame doesn't
  have. Only a double failure (both `content=true` and plain) throws
  (`kind: "http"`).
- `src/discovery/stage3/adapters/lever.ts` —
  `GET api.lever.co/v0/postings/{token}?mode=json`. Response is a raw JSON
  array; `hostedUrl` per posting is the `RawItem.url`.
- `src/discovery/stage3/adapters/workday.ts` —
  `POST {base}/wday/cxs/{tenant}/{site}/jobs`, paginated by `offset`/`limit`
  (20/page) until `total` is collected, capped at a hard safety ceiling of
  500 requests-worth of items (hitting the ceiling before `total` is
  collected throws `kind: "shape"`, noting truncation — no partial result is
  returned in that case). Missing `site` on a registry entry throws
  `kind: "shape"` before any request is made. `CompanyRegistryEntry` has no
  field for the per-tenant `wd{N}` subdomain (frame frozen) — `workday.ts`
  keeps a small local `TENANT_BASE_URL` lookup (currently just `redhat`),
  analogous to Greenhouse/Lever hardcoding their own API host. **URL
  construction is `${base}/${site}${externalPath}`** — live-verified
  (`GET` against the constructed Red Hat URL): this form resolves 200/no
  redirect; the site-less form `${base}${externalPath}` 404s. (An initial
  implementation silently dropped the `/${site}/` segment on the assumption
  that `externalPath` carried the full path — it didn't; caught and fixed
  during Step 2 review, before merge.)
- `src/discovery/stage3/adapters/ashby.ts` —
  `GET api.ashbyhq.com/posting-api/job-board/{token}`. The public board page
  (`jobs.ashbyhq.com/{token}`) is a client-rendered SPA that doesn't expose
  its data-fetch URL statically, so this uses Ashby's documented no-auth
  public Job Board API instead; confirmed live against `signoz` and
  `hashgraph`. `jobUrl` (fallback `applyUrl`) per job is the `RawItem.url`.
- `src/discovery/stage3/registry.ts` — the locked Phase 1 `COMPANY_REGISTRY`
  (exactly 8 entries: Grafana Labs/ClickHouse/Chainguard/Tailscale on
  Greenhouse, Sysdig on Lever, Red Hat on Workday, SigNoz/Swirlds Labs on
  Ashby) and `PLATFORM_SOURCE_META` (one `SourceMeta` per platform, feeding
  `buildSourceProposal`). All four platforms are `ingestion_method: "api"` —
  Workday's classification as `"api"` (not `"scrape"`) is a locked operator
  decision, 2026-07-20: the CXS endpoint is a documented JSON API even
  though it backs a rendered careers site.
- 31 new tests across 5 files (`greenhouse.test.ts`, `lever.test.ts`,
  `workday.test.ts`, `ashby.test.ts`, `registry.test.ts`): per-platform
  RawItem mapping (payload deep-equal to fixture, untouched), empty board,
  non-200 → `http`, garbage JSON → `parse`, wrong shape → `shape`; Greenhouse
  content=true fallback; Workday 3-page pagination (20/20/5=45), safety-
  ceiling truncation, missing-`site` error; registry shape (8 entries, every
  workday entry has `site`, every platform has an adapter); all four
  admission proposals pass `admitSource` individually and cumulatively
  (4 × 2 = 8 min/week, well under the 50 min/week global budget). Full
  suite: 631 passing (50 files), up from the 600/45 baseline. Zero diff to
  the 12 engines, pipeline, persistence, prerank, scope, or the Wave 2 frame
  files.
- `src/discovery/stage3/scripts/live-verify.ts` — the one-request-per-
  platform bounded live check (not part of the automated suite; see Notes).

### Notes

- Zero LLM calls, zero Airtable, zero pipeline runs, zero CLI wiring this
  wave. `index.ts`'s public surface is untouched — adapters/registry aren't
  imported anywhere yet; Wave 6 wires the orchestrator.
- Live-verified (bounded, per the Wave 3 network policy): one request per
  platform against the real boards — Greenhouse 114 items (research 114,
  drift 0), Lever 5 items (research 5, drift 0), Workday 40 items (research
  228, drift −188 — expected board-content drift, not a parsing problem),
  Ashby 14 items (research 12, drift +2) — plus the two bounded requests
  resolving the Workday URL form (see above). All clean parses, zero
  retries needed.
- `live-verify.ts` is excluded from `vitest run` purely by filename: it
  doesn't match the default test glob (`**/*.{test,spec}.*`), and there is
  no `vitest.config.ts` in the repo to special-case. **Standing invariant:**
  if a `vitest.config.ts` is ever added, or the include glob is ever
  widened, this exclusion must be preserved explicitly — the default suite
  must stay network-free forever.

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
