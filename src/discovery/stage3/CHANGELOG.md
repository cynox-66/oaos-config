# Changelog — Stage-3 Source Families

## [0.4.0] — 2026-07-28

Wave 5 of OAOS Phase 1 — the query-first net sources, and the last
construction wave of Phase 1. Five sources whose requests are built from the
operator's CONFIRMED discovery scope (`preferences.json`, D15), which makes
query construction the wave's central design problem. Per the approved
architectural decision, each source decides how to use the scope: these APIs
genuinely differ, and one uniform query builder would have served none of them
well.

### Added

- `src/discovery/stage3/sources/himalayas.ts` — `GET /jobs/api/search?q=<term>`,
  one search per enabled scope field. Best content quality of the five: full
  HTML descriptions (avg ~5 KB) plus structured `locationRestrictions` /
  `timezoneRestrictions`. Sends NO `limit` or `offset`: both are IGNORED by the
  search endpoint (live-verified — `limit=100&offset=20` echoed `limit:20,
  offset:0` and returned the byte-identical first page). The sibling firehose
  `/jobs/api` is deliberately NOT used: no query support at all, ~4,000 new
  postings/day, 20 jobs spanning 7 minutes — measured and rejected.
- `src/discovery/stage3/sources/freehire.ts` — `GET /api/v1/jobs/search`
  with `q`, `work_mode=remote`, `limit=20`, `offset=0`. PLURAL `regions` /
  `countries` params only (the singular forms filter nothing — Phase 0 finding,
  re-confirmed). No country filter applied: the scope is remote-only worldwide
  and India is ~3.4% of this corpus. CONTENT-QUARANTINED.
- `src/discovery/stage3/sources/adzuna.ts` — `GET /v1/api/jobs/in/search/1`,
  `what=<term> remote`, `sort_by=date`, `max_days_old=14`, page 1 only. The
  appended " remote" is the tightener that makes domain terms usable: a bare
  keyword returns 10k+ noisy India matches, the tightened form returns tens of
  genuine ones. `what_all` + `what_or` (which would collapse 13 requests into
  1) was tried and REJECTED BY THE API with a 400. CONTENT-QUARANTINED.
- `src/discovery/stage3/sources/remotive.ts` — the only scope-INDEPENDENT
  source: the API has no free-text query. HARD-CAPPED at 1 call per UTC day
  against persisted state, checked before a request is built. Descriptions are
  full text, so no quarantine.
- `src/discovery/stage3/sources/hn-hiring.ts` — two fixed requests
  (`search_by_date` to locate the current thread, `items/{id}` for its body);
  scope drives the PREFILTER, not the request.
- `src/discovery/stage3/query/scope-terms.ts` — `deriveQueryTerms` /
  `cappedTermsError`. The single place a `Preferences` becomes search terms.
  `MAX_QUERY_TERMS = 15`; terms beyond the cap are DROPPED AND REPORTED, never
  silently truncated.
- `src/discovery/stage3/query/truncation.ts` — the content quarantine.
- `src/discovery/stage3/query/hn-prefilter.ts` — `prefilterComments`,
  `liftCompany`, `decodeCommentText`.
- `src/discovery/stage3/query/remotive-state.ts` — the daily-cap store.
- `src/discovery/stage3/query/http-json.ts` — one GET-and-parse helper so all
  five classify transport failures identically.
- `src/discovery/stage3/sources/meta-wave5.ts` — `WAVE5_SOURCE_META`.
- `src/discovery/stage3/scripts/live-verify-wave5.ts` — bounded live check.
  Runs each source against a ONE-TERM view of the real scope (a query_net
  source issues one request per term, so "one request per source" is not
  available). Remotive EXCLUDED by default; `--with-remotive` to include it.
- 143 new tests across 8 files. Full suite: 890 passing (71 files), up from a
  747/63 baseline.

### Changed

- `src/discovery/stage3/types.ts` — `StageSourceFamily` gains `"query_net"`.
  The wave's ONLY frame touch, operator-authorized. Additive and safe because
  NOTHING IN THIS CODEBASE SWITCHES OR DISPATCHES ON `family` — it is carried
  into `SourceRunSummary` and printed. A comment on the type records this, so a
  future session adding dispatch knows it was never load-bearing.
- `RepoAdapter`/`FeedPipelineAdapter` untouched; no other frame file changed.

### The three structural constraints

These are enforced in code and pinned by tests, not left to convention.

1. **Adzuna and freehire truncated text can never present as content.** Engine
   1 exposes NO settable marker: `RawItem` has five fields and none is a flag,
   and `needs_enrichment` is COMPUTED (`completeness < 0.4`) from a formula
   that does not consider the description at all. What exists instead is an
   asymmetry — Engine 1's `job_board` adapter reads a description only from
   TOP-LEVEL keys (`description`, `desc`, `body`, `details`, `summary`), while
   prerank's `extractText` harvests EVERY string leaf at any depth. The
   quarantine nests the original record untouched under `source_record` and
   surfaces the text under `description_truncated`. Net effect: the text SCORES
   for relevance and is never lost, but `description_raw` comes out empty.
   `quarantineContent` THROWS if a lifted field would be readable as a
   description. Two distinct `content_source` values keep the sources
   distinguishable: `adzuna:search-api-500char` (hard 500-char cut, visible
   "…") and `freehire:search-api-1k-cap` (silent ~1000-char cap, min 956 /
   median 995 / max 1002 across 100 sampled, NO marker — arguably the more
   dangerous of the two). Tested against real `normalize()` and real
   `extractText()`, with a control case proving a naive payload WOULD leak.
2. **Remotive never exceeds 1 call per UTC day.** The state check happens
   before a URL is constructed, so a second same-day call is refused with zero
   bytes on the wire. `healthCheck` performs NO I/O — it replays the outcome
   recorded by the last fetch; probing instead would burn two calls per run and
   make the cap a lie. A failed call still spends the day's budget.
3. **HN spends nothing on unfiltered comments.** `prefilterComments` is the
   ONLY path from thread children to RawItems — non-matching comments are never
   built into items, so they never reach prerank or the pipeline's ~4 Gemini
   calls per item. `search_by_date` is asserted, plain `search` is asserted
   against (relevance-sorted search returns stale 2020/2016 threads).

### Fixed

- **HN one-fingerprint-per-thread collapse** (live-caught, first Wave 5 dry
  run: 150 of 151 prefiltered comments deduped away). Engine 1's fingerprint is
  `sha1(company|role|url-host)`; HN comments carry no structured company or
  role, so every comment produced `company=""`, `role=""` and the shared host
  `news.ycombinator.com` — one identical fingerprint for the whole thread.
  Fixed by `liftCompany`: the first `|`-delimited segment becomes `company`,
  guarded (a delimiter must be present; ≤60 chars; ≤8 words; no internal
  sentence break). Reading a documented delimiter is FIELD MAPPING, not
  classification — HN's thread publishes the `Company | Role | Location`
  format in its own posting instructions, so this is the same operation as
  Greenhouse's `content` → description. Only the company is lifted; role and
  location genuinely vary in order and count and extracting those WOULD be
  judgment. A RATIO GUARD reports a `SourceError` when the lift succeeds on
  fewer than half the prefiltered comments, so a convention drift reads as a
  health signal rather than a quiet drop in yield — loud, but not
  auto-disabling, since a format change is not the source being broken.
  Live-confirmed: 151 fetched → 12 deduped (was 150) → 25 passed (was 0), with
  the ratio guard silent.

### Notes

- Zero LLM calls anywhere in this tree. Every test injects a fake `SourceDeps`;
  the default suite remains network-free.
- Sources never read files. Confirmed scope arrives through
  `SourceBuildContext.preferences`, loaded ONCE by the CLI for both the prerank
  vocabulary and the sources. No second loader for `preferences.json`, and this
  path is strictly read-only — no session ever writes that file.
- Adzuna credentials arrive the same way (`ADZUNA_APP_ID` / `ADZUNA_APP_KEY`
  via `SourceBuildContext`), never read from disk by a source module.
- `SourceErrorKind` was NOT extended (the one authorized frame touch was the
  family union). Remotive's daily-cap refusal therefore uses `kind: "http"`
  with a detail beginning "refused locally, nothing was sent" — a known wart,
  recorded rather than smoothed over. It costs nothing operationally: health
  comes from `healthCheck`, never from fetch errors, so a refusal cannot push
  the source toward `auto_disabled`.
- Every new source table row ships `enabled: false`. Nothing was activated.

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
