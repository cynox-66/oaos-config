# OAOS — Session Context (read this before anything else)

## Project state
- 12 engines complete and on `main` (one-line purpose each):
  1. Normalization (`src/engines/normalization`) — convert heterogeneous
     source items into one canonical `Opportunity` schema. [pure]
  2. Scoring (`src/engines/scoring`) — Quality(0–50)/Match(0–50)/
     Total(0–100)/Tier(S/A/B/C). [Gemini]
  3. Evidence Matching (`src/engines/evidence-matching`) — pick the 1–3
     best evidence assets for an opportunity, each with a relevance reason.
     [Gemini]
  4. Recommended Action (`src/engines/recommended-action`) — deterministic
     map: scored opportunity → {Apply, Outreach, Both, Ignore}. [pure]
  5. Contact Ranking (`src/engines/contact-ranking`) — find + rank the
     human(s) to approach by reachability + role-relevance. [pure]
  6. Application Package (`src/engines/application-package`) — resume
     variant + cover letter for Apply/Both. [Gemini]
  7. Outreach Package (`src/engines/outreach-package`) — channel-correct
     outreach draft referencing matched evidence. [Gemini]
  8. Follow-Up (`src/engines/follow-up`) — schedule + draft follow-ups,
     terminate cleanly (state machine, ≤3 FUs). [Gemini]
  9. Source Performance (`src/engines/source-performance`) — quantify which
     sources produce responses → interviews → offers → income. [pure]
  10. Income Attribution (`src/engines/income-attribution`) — tie money back
      to source → opportunity → outcome. [pure]
  11. Source Admission (`src/engines/source-admission`) — gate which sources
      enter automated discovery (all-checks-pass). [pure]
  12. Long-Term Intelligence (`src/engines/long-term-intelligence`) —
      re-weight discovery + recalibrate scoring from accumulated outcomes;
      read-only analysis, human-approved feedback. [pure]
- Pipeline wiring complete: src/pipeline/intake.ts (`runPipeline`)
- Research enrichment complete: src/pipeline/research.ts
  (`researchOpportunity`) — Gemini company profile per
  prompts/company-research.md; feeds research.stage +
  research.oss_involvement into Engine 2. Replaces the old
  `research = null` stub in intake.ts step 2. Any Gemini failure →
  null (unchanged graceful-degradation path). Unit + integration
  tested (src/pipeline/tests/research.test.ts).
- Persistence layer complete: src/persistence/ (Airtable REST: read.ts,
  write.ts, records.ts, airtable.ts, config.ts). NOTE: opportunityFields
  writes ONLY Quality Score + Match Score — Total Score & Tier are
  Airtable formula (computed) fields; writing them 422s.
- CLI: complete — `oaos` entry (cli/index.ts) with intake / score /
  contacts / report; pure input+output in cli/{prompts,format,args}.ts.
  Live-verified: `oaos report` (read) + intake write path (create OK,
  no 422) against the real base.
- Gemini model: `gemini-3.1-flash-lite` (src/engines/scoring/config.ts
  `GEMINI_MODEL`, single source of truth; endpoint derived from it).
  Switched from `gemini-3.5-flash`/`gemini-2.0-flash` on the OAOS-v2
  Google Cloud project. Verified via isolated curl: clean 200, real
  text, faster response than 2.5/3.5-flash, and JSON-mode confirmed
  valid structured output. Rate limits on OAOS-v2: 15 RPM / 500 RPD
  per model — comfortably covers the pipeline's per-run call volume
  (up to 4 calls: 3 evidence-matching reasons + 1 scoring), with real
  headroom. This supersedes any model-load-split plan — no splitting
  or fallback chain needed at this scale. If 429/503s recur, check
  aistudio.google.com/app/apikey rate-limit dashboard first before
  assuming a code defect — the earlier debugging saga was entirely
  external (deprecated model + stale billing on the old project).
- Stage 2 discovery complete (parsing layer): src/discovery/stage2/ —
  email-alert parsers for LinkedIn / Indeed / Wellfound / We Work
  Remotely / Upwork (freelance) / Remote OK. Each parser is pure
  `parseAlert(rawText): RawItem[]` (multi-listing); `parse.ts` does
  From:-domain source detection + dispatch (null on unknown).
  Input mechanism: file-based, full raw email text (headers + body) —
  NOT live Gmail OAuth (operator-confirmed). RawItems flow through the
  existing normalize() → runPipeline path via the job_board adapter (no
  engine/adapter change).
- Stage 2 transport complete: `oaos discover [--dir <path>] [--dry-run]`
  (cli/commands/discover.ts). Reads .eml/.txt from discovery-inbox/ →
  parseAlertEmail → per listing normalize()+runPipeline+persist → moves
  file to discovery-inbox/processed/. Decision table: unrecognized
  source → left + flagged; processItem throws (fatal) → left for retry;
  recognized+processed (incl. 0 listings / non-fatal write errors) →
  moved. Persistence is fingerprint-idempotent so re-runs are safe.
  Core is `runDiscover(deps)` with injected fs + processItem (unit-
  tested with fakes; no real Airtable/Gemini). discovery-inbox/ +
  processed/ kept via .gitkeep; *.eml/*.txt/processed contents
  gitignored. Live-verified: dry-run (no write/move) + real run
  (write + move to processed). NOTE: real run hit Gemini 429s — engines
  degraded gracefully (opportunity still written with fallback scores,
  file still moved), consistent with the daily free-tier cap.
- Prerank gate complete (Phase 1 Wave 0): src/discovery/prerank/ —
  pure lexical pre-filter that selects top-K from a Stage-3 batch so
  only survivors spend Gemini budget (~4 calls/item; free tier 500/day).
  `prerank({items, vocabulary, config?}, {now?})` → {passed, gated,
  stats}. Gates in order: insufficient_text (<40 chars) → negative_term
  → location (remoteOnly default true; hybrid counts as onsite;
  conservative — ambiguous passes) → below_floor → beyond_k. Score =
  IDF-weighted vocab overlap, IDF over the current run's full batch
  (idf = ln((N+1)/(df+1)), so a term in every item weighs 0). Homogeneous
  batches (denominator 0 but matches exist, e.g. one company's board)
  fall back to plain overlap so a 100%-relevant batch isn't gated out
  wholesale; all-zero path reserved for genuine no-match. Invariant
  enforced in-module (throws): passed+gated === items — nothing dropped
  without a reason. 100% pure: zero LLM, zero network, zero I/O.
  `vocabulary` is required — DEFAULT_VOCABULARY is exported data the
  caller passes explicitly (no implicit fallback), so the Wave 1
  preferences.json swap is a one-line call-site change. NO LIVE CALLER
  YET — wiring into `oaos discover` happens when Stage 3 sources land.
- Discovery scope complete (Phase 1 Wave 1, decision D15):
  src/discovery/scope/ + `oaos setup-scope [--show]`. Generates a proposed
  discovery field map from the operator's real artifacts, the operator
  confirms/unticks/adds interactively, result persists to preferences.json
  (repo root, gitignored — operator-specific state). This file is the single
  source of truth for what automated discovery searches for.
  - Public surface: deriveScope / computeBacking / normalizeTerm (pure
    derivation), loadPreferences / writePreferences / parsePreferences /
    ScopeValidationError (strict I/O), reduceScope / parseScopeCommand /
    initialState / buildPreferences (pure reducer), SCOPE_VOCABULARY /
    PREFERENCES_VERSION / DEFAULT_PREFERENCES_PATH / PROPOSED_WORK_TYPES.
  - UNFORGEABILITY PATTERN (remember this by name — it is the mechanism that
    makes D15 structural rather than conventional): an unconfirmed scope is
    NOT REPRESENTABLE as the persisted `Preferences` type. deriveScope returns
    a `ScopeProposal`, never a Preferences. `buildPreferences` THROWS unless
    state.status === "confirmed" and is the SOLE stamper of `confirmed_at`.
    ⇒ The confirmed interactive path (`oaos setup-scope` → operator types
    `done`) is the ONLY legitimate producer of preferences.json. No future
    session may write that file directly — not by hand, not by script, not
    "for convenience," not to unblock a test. Wave 5 query builders and
    Wave 6 orchestration are CONSUMERS ONLY. If you find yourself generating
    a preferences.json without the operator confirming it, stop.
  - Three-layer lock enforcement for the two locked literals
    (`remote_only: true`, `work_types.freelance: false`): (1) literal types,
    (2) reducer refuses the toggle so the lock is unreachable through the UI,
    (3) validator rejects a hand-edited file, naming the path. Also enforced:
    aspirational === (operator_added && !evidence_backed), and
    evidence_backed === (supporting_evidence_ids.length > 0). Validation is
    strict on READ and WRITE and NEVER coerces — reject loudly with the
    offending path (cli/resume.ts philosophy). Silently fixing a scope file
    would be silently inferring scope, which D15 forbids.
  - Matching is exact normalized equality (lowercase, trim, collapse
    [-_\s]+, preserve "/"). NO fuzzy matching: "network" ≠ "Networking",
    "eBPF/LSM concepts" ≠ "eBPF". Under-proposing is the correct failure
    mode — a missed field costs one keystroke; substring matching would
    silently widen discovery scope. On the operator's real artifacts this
    leaves eBPF/Observability/AI-ML unticked (10 of 13 evidence-backed).
  - Re-run semantics: an existing preferences.json becomes the baseline;
    the operator's ticks ALWAYS WIN over a fresh proposal (an unticked field
    stays unticked even after it becomes evidence-backed); evidence backing
    is always recomputed so `aspirational` never goes stale; newly-backed
    fields surface as `newly_backed` / `<NEW EVIDENCE>` — PRESENTATION ONLY,
    never persisted. Operator-added custom terms are preserved, in order,
    after the vocabulary.
  - Vocabulary: DELIBERATE DEEP IMPORT of `DOMAIN_KEYWORDS` from
    src/engines/normalization/config.ts (not via that engine's index.ts,
    which does not re-export it). Chosen so no frozen engine file is
    modified; "Other" is excluded by construction (the Record is keyed by
    Exclude<Domain,"Other">). Never duplicate this list — discovery scope
    and scoring stay aligned on ONE vocabulary.
  - Reducer pattern: the interactive loop is a pure, total, non-mutating
    state machine; the CLI is a thin shell (read line → parseScopeCommand →
    resolve evidence for `add` → reduceScope → render). An inapplicable
    action returns state unchanged with an explanatory `notice`. This is why
    the whole decision surface is unit-testable without a TTY.
  - Purity: ZERO Gemini, ZERO network, ZERO Airtable. The only I/O is
    reading/writing preferences.json and the readline shell. Inputs come
    from the EXISTING strict loaders — loadBaseResume/loadOperatorProfile
    (cli/resume.ts) and loadInventory (evidence-matching engine); never
    reimplement them.
  - NOT WIRED YET: preferences.json has no consumer. Wave 5/6 feeds it to
    per-source query builders and to the prerank gate's `vocabulary` input.
    Per-source query-STRING construction is Wave 5, deliberately not here.
  - 77 new tests. Live-verified against the real repo artifacts (derivation
    + full interactive loop incl. aspirational add, duplicate refusal,
    freelance-lock refusal, abort-writes-nothing).
- Stage 3 source-family core complete (Phase 1 Wave 2): src/discovery/stage3/
  — the shared frame Waves 3-5 hang ~14 concrete sources on. Interfaces and
  scaffolding only; NO concrete source (no real company token, program name,
  or feed URL), NO live network call, NO CLI wiring this wave.
  - `Stage3Source` — the uniform surface every family presents:
    `{ name, family, enabled, fetch(deps): Promise<FetchResult>,
    healthCheck(deps): Promise<HealthCheckResult> }`.
  - STANDING RULE — no source module ever imports fetch/http directly.
    `SourceDeps` (`httpGet`, `httpPost`, `now`) is injected; real HTTP is
    wired in ONLY at Wave 6's orchestrator. Every test in this tree injects
    a fake `SourceDeps`. This is how "zero live network" and "testable
    forever" are both true at once — do not special-case this for a future
    source that "just needs one fetch call inline."
  - `FetchResult.errors` makes partial failure a RESULT, never a thrown
    total-stop — this is Engine 11's `survives_format_change` made
    structural. `FetchResult` also carries an optional `calendarEntries?`
    field (beyond the original spec) so calendar-sink Atom feeds can return
    typed entries while `fetch()`'s return type stays uniform across all
    three families.
  - Health state machine (`health.ts`): `advanceHealth(state, result)` /
    `createHealthState(source)`. One failure → probation. Two CONSECUTIVE
    failures → auto_disabled (Wave 6 skips the source + surfaces it in the
    weekly report: "fall back to Stage-1 manual"). Any success → healthy,
    consecutiveFailures reset to 0 — including recovery from auto_disabled,
    which ALSO sets `recoveredFromDisabled: true` for exactly that one
    advance (cleared on the next advance, success or failure). Wave 6 MUST
    read this flag and require an operator's manual re-enable rather than
    silently resuming a recovered source. Pure, deterministic, all 8
    transitions exhaustively tested.
  - healthCheck SEMANTICS DIFFER BY FAMILY — deliberate, do not "simplify"
    this back to one rule. `company_board` (multi-entry registry) is
    family-level: `ok:false` ONLY when every enabled registry entry failed;
    partial failure (e.g. one rotted token out of four companies) is
    `ok:true` with the degraded entries named in `detail`. Reason: a naive
    `ok: errors.length === 0` would let ONE bad token auto-disable the
    ENTIRE platform after two runs, killing healthy companies and inverting
    the whole point of per-entry isolation in `fetch()`. `github_repo` and
    `atom_feed` are single-config (one owner/repo, one feed URL) — there is
    no "partial" for one config, so they correctly keep the strict
    `ok: errors.length === 0` rule. If a future session touches
    `company-board.ts` healthCheck, re-read this paragraph first.
  - `buildSourceProposal(meta: SourceMeta): SourceProposal` — Engine 11
    admission scaffolding, imports the engine's real type, never redefines
    it. `has_health_check`, `dedupe_compatible`, `survives_format_change`
    default `true` because the `Stage3Source` contract makes them true BY
    CONSTRUCTION. CAVEAT: that default is only valid for sources built
    inside this contract — a future one-off source built outside
    `Stage3Source` must not call `buildSourceProposal` and inherit those
    defaults for free; it hasn't earned them.
  - `ingestion_method` reuses Engine 11's existing `IngestionType` enum
    (`"rss"|"api"|"email_alert"|"scrape"` — no dedicated "atom" value), so
    Atom-family sources map to `"rss"` when building their SourceProposal.
  - Atom parsing is a minimal HAND-ROLLED parser (`atom-feed.ts`) — no
    XML-capable dependency exists in package.json and none was added
    (NLnet/Outreachy are simple well-formed feeds; a real Wave 4 feed that
    breaks it is a contained fix, not a redesign). Do not add an XML
    dependency without asking first.
  - 47 new tests (5 files: health, company-board, github-repo, atom-feed,
    admission). NOT WIRED anywhere — Wave 3 builds concrete company_board
    platform adapters; Wave 4 builds concrete github_repo/atom_feed sources
    + the calendar writer; Wave 6 wires the orchestrator.
- Concrete company_board adapters complete (Phase 1 Wave 3):
  src/discovery/stage3/adapters/{greenhouse,lever,workday,ashby}.ts + locked
  registry src/discovery/stage3/registry.ts (exactly 8 entries — no
  additions without an explicit operator decision). Frame (Wave 2) untouched;
  adapters are the first live callers of `CompanyBoardAdapter`.
  - Greenhouse: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`,
    falls back to the plain listing on non-200 and returns those items
    SILENTLY (no SourceError) — `fetchOne` has no channel to return items
    AND a non-fatal warning at once, and description-less fallback items
    still carry `url`, so Engine 1 flags them `needs_enrichment` and the
    existing research/enrichment step fills the description from the
    posting URL. Self-corrects downstream; do not add an error side-channel
    for this without revisiting the frame.
  - Lever: `GET api.lever.co/v0/postings/{token}?mode=json`, raw array,
    `hostedUrl` → url.
  - Workday CXS: `POST {base}/wday/cxs/{tenant}/{site}/jobs`, paginated
    (limit 20) to `total`, hard safety ceiling 500 (ceiling hit before
    `total` collected → throws `kind:"shape"`, no partial items returned).
    Missing `site` on a registry entry throws before any request.
    CONFIRMED URL CONSTRUCTION (live-verified, 2026-07-20):
    `${base}/${site}${externalPath}` → 200/no redirect against a real Red
    Hat posting; the site-less form `${base}${externalPath}` 404s. An
    initial implementation silently dropped the `/${site}/` segment
    (wrong assumption that `externalPath` carried the full path) — caught
    during Step 2 review via a bounded 2-request live check, fixed before
    merge. If a future session touches `workday.ts`'s url line, do not
    drop the site segment.
  - Ashby: `GET api.ashbyhq.com/posting-api/job-board/{token}` — CONFIRMED
    URL FORM (the public `jobs.ashbyhq.com/{token}` board page is a
    client-rendered SPA with no statically-visible data URL; this is
    Ashby's documented no-auth public Job Board API, live-verified against
    `signoz` + `hashgraph`). `jobUrl` (fallback `applyUrl`) → url.
  - `src/discovery/stage3/scripts/live-verify.ts` — bounded one-request-
    per-platform live check, run manually (`npx tsx
    src/discovery/stage3/scripts/live-verify.ts`). EXCLUSION MECHANISM
    (standing invariant): excluded from `vitest run` purely because its
    filename doesn't match vitest's default test glob
    (`**/*.{test,spec}.*`) — there is no vitest.config.ts to special-case.
    If a vitest.config.ts is ever added, or the glob widened, this
    exclusion must be preserved explicitly; the default suite must stay
    network-free forever.
  - 31 new tests (5 files). Full suite 631 green (50 files). Zero diff to
    the 12 engines, pipeline, persistence, prerank, scope, or the Wave 2
    frame files. NOT WIRED anywhere — adapters/registry aren't referenced
    from `index.ts` or the CLI; Wave 6 wires the orchestrator.
- Concrete github_repo/atom_feed sources + calendar writer complete
  (Phase 1 Wave 4): src/discovery/stage3/sources/{esoc,cncf-lfx,lfdt,nlnet,
  outreachy,ghsl,meta}.ts + src/discovery/stage3/calendar-writer.ts (D18).
  - ESoC: real `RepoAdapter` over european-summer-of-code/esoc2026's
    `cards/` dir — one `.md` file per project, `*batches*.md` excluded by
    filename. Repo name is config (next cohort's rename = one-line change).
  - NLnet: real `FeedPipelineAdapter`, `https://nlnet.nl/feed.atom`,
    pipeline sink. Content-agnostic — every entry becomes a RawItem, no
    classification; prerank/pipeline sort relevance downstream.
  - GHSL (GitHub Security Lab): real `FeedPipelineAdapter`,
    `https://securitylab.github.com/feed.xml`, pipeline sink — built on an
    explicit OPERATOR OVERRIDE of my initial "reject" recommendation. Feed
    verified valid/well-formed but currently 0 entries — a verified-
    mechanism/dormant-content source, not broken. `est_volume_per_week: 0`
    is honest current-state accounting (see `sources/meta.ts`), not a bug.
    If a future session sees GHSL still at 0 items, that's expected until
    GitHub Security Lab publishes.
  - CNCF LFX Mentorship + LFDT: BOTH calendar-tracked, NOT parsed into
    RawItems — D18 boundary, `items` is always `[]`. Original Wave 4 plan
    assumed both fit the `RepoAdapter` pattern; live reality diverged for
    each:
    - CNCF: `programs/lfx-mentorship/{year}/{term}/project_ideas.md` is
      verified empty for BOTH the concluded and active 2026 terms — real
      project data lives on the external mentorship.lfx.linuxfoundation.org
      platform, out of scope. Calendar entry per term instead.
    - LFDT: `docs/projects/{year}.md` has a real 29-project table, but the
      github_repo frame only ever fetches directory-listing METADATA, never
      file content — structurally can't reach it without a frame change.
      Operator ruled calendar-track over extending the frame again.
    - Both: `year` is config, not hardcoded (2026→2027 rollover = one-line
      change). Both reuse `FetchResult.calendarEntries` for a github_repo-
      family source (originally documented as atom_feed-only) — deliberate,
      non-breaking, no frame file touched to allow it.
  - Outreachy: `FeedPipelineAdapter` NOT used — calendar sink only by
    original design (D18), same boundary as CNCF/LFDT.
  - GSoC: DOCUMENTED REJECT (not built). Target repo/org does not exist
    under any live-verified URL variant tried within the bounded Step-1
    budget — see src/discovery/stage3/README.md "Documented rejects".
  - FRAME EXTENSION (operator-approved, additive, non-breaking):
    `RepoAdapter.interpretEntries` and `FeedPipelineAdapter.toRawItem` each
    gained a third `deps: SourceDeps` param — neither hook had ever been
    called by a concrete source before Wave 4, so the inability to read
    `deps.now()` for a real fetch timestamp was a latent Wave 2 gap.
    `RawItem.fetched_at` is NOT decorative — it feeds `normalize.ts`'s
    fingerprint-id + `date_found` directly. Verified backward-compatible by
    re-running `github-repo.test.ts`/`atom-feed.test.ts` unmodified (both
    still pass). If a future session adds a new `RepoAdapter`/
    `FeedPipelineAdapter`, its signature must include `deps`.
  - Calendar writer (D18): `writeCalendarEntries(entries, path?)` →
    `discovery/calendar.json` (gitignored, operator-local, path is the
    `CALENDAR_PATH` default). Upsert keyed by `url`, falling back to
    `title`; BOTH missing → refused (recorded, never written), never an
    invented key. STANDING INVARIANT: this file is read by humans only —
    nothing written here is ever fed into `runPipeline`. If a future
    session is tempted to wire `discovery/calendar.json` into the pipeline,
    that crosses D18; stop and ask.
  - 47 new tests (8 files: esoc, cncf-lfx, lfdt, nlnet, outreachy, ghsl,
    calendar-writer, wave4-admission). Full suite 662 green (58 files).
    Zero diff to the 12
    engines, pipeline, persistence, prerank, scope, Wave 2 frame (besides
    the two additive param extensions), or Wave 3 adapters/registry.
    Live-verified per the bounded network policy: all 6 sources' real
    `.fetch(deps)` matched Step 1 findings exactly, including GHSL's 0/0
    (dormant-not-broken confirmed). NOT WIRED anywhere — none of the six
    sources are constructed with real config outside the two manual
    verification scripts (`scripts/verify-wave4.ts`,
    `scripts/live-verify-wave4.ts`, both excluded from `vitest run` by
    filename, same convention as Wave 3's `live-verify.ts`); Wave 6 wires
    the orchestrator.
- Test count: 662 passing (58 test files) — `vitest run`
- No tsconfig.json by design — tsx direct execution throughout
- Test framework: vitest (`npm test` = `vitest run`)

## Authoritative documents (read ONLY when the task requires their
## specific section — do not re-read in full by default)
- ROADMAP.md — frozen vision, capability map, phase plan
- docs/engine-specs.md — the 12 engine specs (Sections 1-12)
- docs/airtable-spec.md — exact Airtable schema
- evidence/inventory.md — C4 evidence source of truth
- (also: docs/airtable-setup.md, docs/api-setup.md, docs/make-setup.md)

## Working conventions (apply to every task in this repo)
- Every engine is pure-logic-first; LLM calls only where the spec
  requires (Engines 2, 3, 6, 7, 8 use Gemini; the rest are pure).
- Every engine has: types.ts, main logic file(s), config.ts (if
  needed), index.ts, tests/. Follow existing engine folder structure
  exactly for any new engine or module.
- GeminiClient is injectable — reused from src/engines/scoring/gemini.ts.
  Never duplicate the HTTP client.
- Every cross-engine type boundary either matches exactly or is
  structurally assignable (verified via compile-time guards in tests).
  Check existing boundaries before assuming a new adapter is needed.
- Banned-phrase / fabrication checks are always hard regex/trace
  checks, never LLM self-judgment.
- No engine sends anything. Execution is post-approval only.
- Small reviewable commits. Feature branches: feat/<name>. Merge to
  main only after full suite passes and scope is verified clean
  (zero diff to untouched engines).
- When a spec is ambiguous, STOP and ask — do not resolve
  ambiguities with your own design judgment. This has been the
  standing rule for every engine built so far and does not change.

## Token-efficiency rules (NEW — apply from this session onward)
- Use Serena's find_symbol / find_referencing_symbols / get_symbol_overview
  INSTEAD OF reading full files, whenever you need to locate a type,
  function, or understand a module's public surface.
- Only read a full file when you need to see actual implementation
  logic (e.g. to modify it or understand exact behavior), not just
  to find where something is defined or check its signature.
- Before starting any new engine/module task, use Serena to get the
  symbol overview of directly-related existing modules rather than
  cat-ing them in full.
- Do not re-read ROADMAP.md or docs/engine-specs.md in full at the
  start of every task. Read only the specific section relevant to
  the current task (e.g. "Section 6" for Engine 6 work). This file
  (CLAUDE.md) plus a targeted read is sufficient context.
- Prefer `git diff` / `git status` over re-reading files to confirm
  what changed.

## Current task
- CLI Entry Point: COMPLETE, live-verified, merged to main (12aecbe).
  `oaos intake` (interactive → runPipeline → persist), `oaos score --company`
  (re-score, PATCH Quality/Match only), `oaos contacts --repo` (spawn github
  scan → POST newest *-airtable-*.json to Contacts), `oaos report` (F5 weekly
  metrics). Pure pieces unit-tested (cli/tests: prompts, format, args,
  intake-mapping). 278 tests pass. F1–F6 all resolved. F2: manual adapter
  honors an operator-asserted category. Persistence fix along the way:
  opportunityFields no longer writes computed Total Score/Tier (was 422-ing
  every scored write). Live-verified read (report) + write (intake create,
  rec recuJNCX3Y3fKJDZP). Interactive prompt UX to be confirmed by operator
  in a real TTY (readline can't be driven headless — non-blocking).
- Research enrichment: COMPLETE (feat/research-enrichment). Pipeline
  step 2 now calls `researchOpportunity` instead of `research = null`.
- Stage 2 discovery: COMPLETE. Parsing layer (6 parsers) merged to
  main; transport `oaos discover` on feat/discover-command
  (watched-folder → pipeline → persist → move), pending merge.
- Prerank gate (Phase 1 Wave 0): COMPLETE, merged to main
  (src/discovery/prerank/). Built + tested + exported; not yet wired
  (Stage 3 has no sources). 38 tests.
- Discovery scope setup (Phase 1 Wave 1, D15): COMPLETE, merged to main
  (feat/discovery-scope-setup). src/discovery/scope/ + `oaos setup-scope`.
  77 new tests; full suite 553 green. Zero diff to the 12 engines, the
  pipeline, persistence, and prerank. NOTE: preferences.json is NOT in the
  repo — the operator must run `oaos setup-scope` in a real TTY and confirm
  to create it. Do not create it for them (see the unforgeability pattern
  above).
- Stage 3 source-family core (Phase 1 Wave 2): COMPLETE, merged to main
  (feat/stage3-interfaces). src/discovery/stage3/ — Stage3Source contract,
  SourceDeps injection, health state machine, three family interfaces
  (company_board, github_repo, atom_feed), Engine 11 admission scaffolding.
  47 new tests; full suite 600 green (45 files). Zero diff to the 12
  engines, pipeline, persistence, prerank, scope. Interfaces/scaffolding
  only — no concrete source, no live network call, no CLI wiring.
- Concrete company_board adapters (Phase 1 Wave 3): COMPLETE, pending
  operator go-ahead to branch/commit/merge. src/discovery/stage3/adapters/
  {greenhouse,lever,workday,ashby}.ts + src/discovery/stage3/registry.ts
  (locked 8-entry registry). 31 new tests; full suite 631 green (50 files).
  Zero diff to the 12 engines, pipeline, persistence, prerank, scope, or the
  Wave 2 frame. Live-verified per the bounded network policy: 4 platform
  requests (Greenhouse 114/research 114, Lever 5/5, Workday 40/research 228 —
  expected board-content drift, Ashby 14/research 12) all clean on first
  attempt, zero retries; plus 2 bounded requests that caught and fixed a
  Workday URL-construction bug (site segment was being dropped) before
  merge — see the Wave 3 entry above for the confirmed
  `${base}/${site}${externalPath}` form. Not wired anywhere (Wave 6).
- Concrete github_repo/atom_feed sources + calendar writer (Phase 1
  Wave 4): COMPLETE, pending operator go-ahead to branch/commit/merge.
  src/discovery/stage3/sources/{esoc,cncf-lfx,lfdt,nlnet,outreachy,ghsl,
  meta}.ts + src/discovery/stage3/calendar-writer.ts (D18) — see the Wave 4
  entry above for the full per-source breakdown (two calendar-tracked
  pivots, one operator-overridden build, one documented reject, two
  frame-interface extensions). 47 new tests; full suite 662 green (58
  files). Zero diff to the 12 engines, pipeline, persistence, prerank,
  scope, or Wave 3. Live-verified per the bounded network policy: all 6
  sources' `.fetch(deps)` output matched Step 1 findings exactly. Not
  wired anywhere (Wave 6).
- NEXT UP (hold for direction): Wave 5 query builders (first consumer of
  preferences.json) — or Wave 6 orchestrator wiring (real SourceDeps, the
  health-state loop, calendar writer's real call site, weekly-report
  auto_disabled surfacing) — or operator-chosen priority.
