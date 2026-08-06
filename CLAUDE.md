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
    still carry `url`. CORRECTION (2026-07-28, Wave 5): this entry used to
    claim those items get flagged `needs_enrichment` and backfilled by the
    research step. THEY DO NOT. Engine 1's completeness formula does not
    consider the description at all — company+role+category+url = 4/6 = 0.67,
    well above the 0.4 threshold — so they pass as complete, and
    `researchOpportunity` fetches a COMPANY profile, not the posting body.
    The code is unchanged and still fails safe (the items carry `url`, so a
    human can click through); only the stated mechanism was wrong. See
    docs/known-issues.md #14. Do not add an error side-channel here without
    revisiting the frame.
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
- Stage 3 orchestration complete (Phase 1 Wave 6): src/discovery/orchestrator/
  + cli/commands/stage3.ts. The first wave that WIRES anything — prerank gets
  its first live caller, health checks execute and persist, `oaos discover`
  grows a Stage-3 path. Nothing is admitted or activated (that is Wave 8).
  - `runStage3(deps)` — the coordinator. All side effects injected
    (`Stage3RunDeps`), so every test uses fake SourceDeps + a memory health
    store + a fake calendar sink + a fake processItem. Zero network, Airtable,
    Gemini, or disk in the suite.
  - `orchestrator/http.ts` `createSourceDeps()` is THE ONLY PLACE IN THE
    CODEBASE THAT CONSTRUCTS REAL HTTP for Stage 3. Source modules still take
    SourceDeps injected and import no HTTP client (Wave 2 standing rule). If a
    source needs a capability SourceDeps lacks, extend the frame interface and
    wire it here — never `import fetch` in a source module.
  - SOURCE TABLE (D14): `orchestrator/sources.ts`, 10 rows —
    greenhouse/lever/workday/ashby (company_board→pipeline),
    esoc/nlnet/ghsl (→pipeline), cncf-lfx/lfdt/outreachy (→CALENDAR).
    THIS IS THE FILE THE OPERATOR EDITS TO ACTIVATE A SOURCE. Every row ships
    `enabled: false` — locked operator decision 2026-07-28; Wave 6 builds the
    ability to run, Wave 8 decides what runs. `sources.test.ts` GUARDS that
    default: if "ships every row disabled" fails, someone activated a source.
    Two toggle levels: family-level here, per-company in stage3/registry.ts.
  - `boardEntry` MUST slice COMPANY_REGISTRY by `adapter.platform`.
    `createCompanyBoardSource` hands every entry it is given to
    `adapter.fetchOne` WITHOUT checking `entry.platform`, so an unsliced
    registry makes each adapter fetch every other platform's company against
    its own API. Live-caught 2026-07-28: the Ashby row fetched all six
    non-Ashby tokens → five spurious 404 SourceErrors, enough to drive a
    healthy family to auto_disabled in two runs. Regression test drives every
    board row with a recording fake. DO NOT DROP THE FILTER.
  - THE THREE WAVE-6 RULINGS (operator, 2026-07-28):
    - Q1 — Stage 3 runs the FULL pipeline in one invocation (fetch → normalize
      → prerank → runPipeline → persist), matching Stage 2 exactly. Prerank's
      maxPerRun 25 × ~4 Gemini calls = 100/run vs the 500/day cap ≈ 5 runs/day.
      `--dry-run` is the inspect-before-spending path. Rejected alternative:
      persist survivors un-analyzed — no bulk-score command exists, so that
      loop is incomplete.
    - Q2 — NO preferences.json ⇒ NO Stage 3. Deliberately no DEFAULT_VOCABULARY
      fallback: D15 makes preferences.json the sole source of truth for what
      discovery searches for, so a fallback would search a scope the operator
      never approved. The refusal applies to `--dry-run` too. The ORCHESTRATOR
      still takes `vocabulary` as injected data (prerank's no-file-reads rule
      + disk-free tests); the CLI does the loading and the refusing.
      `vocabulary.ts` maps Preferences → PrerankVocabulary asymmetrically:
      domainTerms ← ENABLED preferences fields; roleTerms/negativeTerms ←
      DEFAULT_VOCABULARY (preferences.json has neither, and extending its
      schema is a scope-module change not taken this wave).
      THIS WAVE NEVER WRITES preferences.json — read-only, and optional.
    - Q3 — health persists to `discovery/health.json` (gitignored,
      operator-local, sibling of calendar.json). AUTO-DISABLED SOURCES ARE
      PROBED WITH healthCheck() ONLY, NEVER fetch() — that is what makes
      `recoveredFromDisabled` live code instead of dead code. A clean probe
      REPORTS recovery but never resumes the source.
      `oaos discover --stage3 --reenable <name>` is the SOLE exit from
      auto_disabled; no hand-editing of state files.
  - Health file posture: a corrupt/malformed health.json THROWS naming the
    path and the offending key — NEVER a silent reset, which would re-enable
    every auto-disabled source without the operator learning a source had been
    failing. A MISSING file is not corruption (starts empty, created on flush).
    `oaos report` deliberately does not swallow that throw either.
  - D18 ENFORCED, not assumed: a `sink: "calendar"` row's RawItems are DROPPED
    and reported, so a format change can't silently push calendar content into
    the pipeline. `sink` governs ITEMS ONLY — `calendarEntries` are routed to
    the writer from any source, since that direction can't cross D18.
  - Prerank runs ONCE over the whole run's combined batch, not per source
    (IDF is defined over the run's full batch; maxPerRun is the run's Gemini
    budget, not a per-source quota). Passed/gated are attributed back per
    source by RawItem identity. Within-run duplicate fingerprints are collapsed
    BEFORE preranking — loses nothing (writeOpportunity dedupes on the same
    fingerprint anyway), just stops duplicates from spending Gemini budget.
  - CLI: `oaos discover --stage3` + exactly one of `--all-enabled` /
    `--source <name>` / `--reenable <name>`, plus `--dry-run`. A bare
    `--stage3` is REFUSED rather than defaulting to a full run.
    `--source <name>` DELIBERATELY BYPASSES the family toggle — naming a source
    is the operator's activation gesture for that one invocation; the toggle
    answers "what runs when I ask for everything". Per-company registry
    toggles still apply either way.
  - `oaos report` grows a Stage-3 health section: per-source status, last
    check detail VERBATIM, auto-disabled + recovered alerts carrying the exact
    re-enable command. Omitted entirely (not shown empty) when no Stage-3 run
    has ever happened.
  - 85 new tests (5 files: orchestrator, health-store, sources, vocabulary,
    cli/stage3). Full suite 747 green (63 files). Zero diff to the 12 engines,
    pipeline, persistence, prerank, scope, or any Stage-3 frame/source/adapter
    file. Live-verified per the bounded network policy: ashby+nlnet flipped on
    temporarily, ONE `--dry-run`, both reverted — ashby 17→13 passed/4 gated,
    nlnet 342→179 deduped→12 passed/151 gated, prerank 180 in→25 passed, zero
    errors, `discovery/` never created, preferences.json untouched. Mixed
    two-family batch confirmed IDF works as designed (ashby = 9% of the batch
    but took 13 of 25 passed slots; homogeneous fallback correctly did not
    trigger).
  - FINDINGS NOT ACTED ON (out of Wave 6 scope, relevant to Wave 7/8):
    (1) ClickHouse appears to run an Ashby board (~171 postings) despite being
    registered as `greenhouse` — surfaced by the buggy first run, registry.ts
    untouched. (2) NLnet dedupes ~52% of its feed (342 items → 163
    fingerprints) because every item shares the nlnet.nl host and Engine 1
    extracts few distinct company/role pairs — an Engine 1 / Wave 4 question,
    costs nothing today. Also: 342 items is a full-site feed, so at
    maxPerRun 25 NLnet alone would dominate a run's budget.
- Query-first net sources complete (Phase 1 Wave 5 — LAST construction wave of
  Phase 1): src/discovery/stage3/sources/{himalayas,freehire,adzuna,remotive,
  hn-hiring}.ts + src/discovery/stage3/query/{scope-terms,truncation,
  hn-prefilter,remotive-state,http-json}.ts + sources/meta-wave5.ts. The first
  sources whose REQUESTS are built from the operator's confirmed scope.
  - THE THREE WAVE-5 RULINGS (operator, 2026-07-28):
    - Q1 — `StageSourceFamily` gains `"query_net"`. The wave's ONLY frame
      touch, authorized as one line. Safe because NOTHING IN THE CODEBASE
      SWITCHES OR DISPATCHES ON `family` — verified by grep; it is carried
      into SourceRunSummary and printed in the weekly report. A comment on the
      type records this. Labeling a REST search API `atom_feed` was rejected as
      dishonest: the run summary would lie to the operator every week.
    - Q2 — confirmed scope reaches sources via `SourceBuildContext.preferences`
      (an ORCHESTRATOR type, not a frame type — already existed for
      `githubToken`). The CLI's `loadScope` reads preferences.json ONCE and
      returns both the prerank vocabulary and the Preferences object. NO second
      loader, no source reads disk, orchestrator stays disk-free. Wave 6's "no
      preferences.json ⇒ no Stage 3" is inherited for free. Adzuna credentials
      ride the same channel (`ADZUNA_APP_ID`/`ADZUNA_APP_KEY`). STILL never
      writes preferences.json.
    - Q3 — caps: MAX_QUERY_TERMS 15 (excess terms DROPPED AND REPORTED as a
      SourceError, never silent); ONE PAGE PER QUERY always; page size 20 (so
      no source dominates a mixed prerank batch — the NLnet lesson); Remotive
      1 call/UTC day; HN 2 unconditional requests. Full run at 13 enabled
      fields = 47 requests (13+1, 13+1, 13+1, 1+0, 2+1).
  - PER-SOURCE QUERY STRATEGY (approved as architecture — these APIs differ
    enough that one uniform builder would serve none of them well):
    - himalayas: `GET /jobs/api/search?q=<term>`, one per enabled field. Best
      content of the five — full HTML descriptions (~5KB) + structured
      locationRestrictions/timezoneRestrictions. SENDS NO limit/offset: BOTH
      ARE IGNORED by the search endpoint (live-verified — limit=100&offset=20
      echoed limit:20/offset:0 and returned the byte-identical first page).
      There is no pagination; you get a fixed top ~20 of the match set. The
      sibling firehose `/jobs/api` is REJECTED, not unused: no query support at
      all (`query=` silently ignored), ~4,000 new postings/day, 20 jobs
      spanning 7 minutes — it can never be a coverage mechanism.
    - freehire: `GET /api/v1/jobs/search?q=&work_mode=remote&limit=20&offset=0`.
      PLURAL `regions`/`countries` only — the singular forms filter NOTHING
      (Phase 0 finding, re-confirmed: countries=in cut a total 5266→132 and all
      100 rows carried "in"). NO country filter applied: scope is remote-only
      worldwide and India is ~3.4% of the corpus.
    - adzuna: `what=<term> remote&sort_by=date&max_days_old=14`, page 1 only.
      The appended " remote" is load-bearing — a bare domain keyword returns
      10k+ noisy India matches, the tightened form returns tens of genuine ones.
      `what_all`+`what_or` (13 requests → 1) was TRIED and REJECTED BY THE API
      with a 400; do not re-attempt without budget.
    - remotive: NO query — the API has none. Its only lever is `category`, and
      in the one permitted probe `category=software-dev` DID NOT FILTER (36
      rows spanning Sales/Medical/Marketing, only 10 Software Development;
      Phase 0c had recorded it working). Ruling: send it, don't rely on it,
      don't spend a second call investigating. Its test asserts scope-
      INDEPENDENCE — faking a scope dependency would misrepresent the API.
    - hn-hiring: two fixed requests (`search_by_date` → current thread,
      `items/{id}` → 513KB whole thread in one). Scope drives the PREFILTER,
      not the request. MUST filter hits on /who is hiring/i — the same author
      posts "Who WANTS TO BE HIRED?" at an identical timestamp every month, so
      taking hits[0] would eventually ingest job SEEKERS as postings.
  - THREE STRUCTURAL CONSTRAINTS — STANDING INVARIANTS, enforced in code:
    (1) CONTENT QUARANTINE (query/truncation.ts). Engine 1 exposes NO settable
        content marker: RawItem has 5 fields, none a flag, and
        `needs_enrichment` is COMPUTED from a formula that ignores the
        description entirely (see known-issues #14). What exists is an
        ASYMMETRY: Engine 1's job_board adapter reads a description ONLY from
        TOP-LEVEL keys [description, desc, body, details, summary], while
        prerank's extractText harvests EVERY string leaf at any depth. So the
        original record is nested UNTOUCHED under `source_record` and the text
        surfaced under `description_truncated`. Net: the text SCORES for
        relevance and is never lost, but description_raw comes out EMPTY.
        Company/title/location ARE lifted to the top level — without them
        fingerprints collapse. `quarantineContent` THROWS if a lifted field
        would be readable as a description. TWO content_source values, keep
        them distinct: `adzuna:search-api-500char` (hard 500-char cut, visible
        "…", 11/11 sampled) and `freehire:search-api-1k-cap` (SILENT ~1000-char
        cap — min 956/median 995/max 1002 across 100, NO marker; Phase 0 had
        measured presence, never length). Tested against REAL normalize() and
        REAL extractText(), plus a control proving a naive payload would leak.
    (2) REMOTIVE 1 CALL/UTC DAY. State checked BEFORE a URL is built, so a
        second same-day call is refused with zero bytes on the wire. A failed
        call still spends the day. `healthCheck` performs NO I/O — it replays
        the last recorded outcome; probing would burn two calls/run and make
        the cap a lie. State: discovery/remotive.json, gitignored, same posture
        as health.json (corrupt file THROWS, never a silent reset — a silent
        reset would hand back a fresh budget every time).
    (3) HN PREFILTER BEFORE PARSE. `prefilterComments` is the ONLY path from
        thread children to RawItems. Non-matching comments never become items,
        so they never reach prerank or the pipeline's ~4 Gemini calls/item.
        Asserts `search_by_date`, asserts against plain `search` (which returns
        stale 2020/2016 threads). The source spends ZERO LLM itself.
  - HN COMPANY LIFT + RATIO GUARD (fix for a live-caught defect). First dry run
    showed hn-hiring fetching 151 comments and deduping 150 — Engine 1's
    fingerprint is sha1(company|role|url-host), and HN comments have no
    structured company/role, so every comment produced company=""/role="" and
    the shared host news.ycombinator.com → ONE fingerprint per thread.
    `liftCompany` takes the first `|`-delimited segment as company, guarded
    (delimiter present; ≤60 chars; ≤8 words; no internal sentence break).
    WHY THIS IS FIELD MAPPING, NOT CLASSIFICATION (operator ruling): the line
    is "judgment about what content MEANS" — deciding a role is security-
    flavored, inferring seniority, scoring relevance. HN's thread PUBLISHES the
    `Company | Role | Location` format in its own posting instructions, so
    reading the first segment is the same operation as Greenhouse's
    content→description or Workday's externalPath→url. The delimiter is a
    schema, just a weak one. Only COMPANY is lifted — role/location genuinely
    vary in order and count, and extracting those WOULD be judgment.
    Must be lifted from the DECODED text, not prerank's `cleaned` (lowercased).
    RATIO GUARD: when the lift succeeds on <half the prefiltered comments, emit
    a SourceError naming the ratio, so a convention drift reads as a health
    signal rather than a quiet yield drop. LOUD BUT NOT AUTO-DISABLING — it
    goes in fetch errors while healthCheck stays green, because a format change
    is not the source being broken. Live-confirmed after the fix: 151 fetched →
    12 deduped (was 150) → 25 passed (was 0), guard silent.
  - `SourceErrorKind` was NOT extended (only the family union was authorized).
    Remotive's cap refusal therefore uses kind:"http" with a detail beginning
    "refused locally, nothing was sent" — a known wart, recorded not smoothed.
    Costs nothing: health comes from healthCheck, never from fetch errors, so a
    refusal cannot drive a source toward auto_disabled.
  - ADMISSION: himalayas 3 / freehire 3 / adzuna 2 / remotive 2 / hn-hiring 3
    = 13. RUNNING GLOBAL TOTAL 32 of the 50 min/wk budget, 18 remaining
    (Wave 3 = 8, Wave 4 = 11, Wave 5 = 13). auth_required is NOT an admission
    check, so Adzuna's credentials don't block it.
  - 143 new tests (8 files: himalayas, freehire, adzuna, remotive, hn-hiring,
    scope-terms, truncation, wave5-admission; + sources.test.ts updated for 15
    rows). Full suite 890 green (71 files). Zero diff to the 12 engines,
    pipeline, persistence, prerank, scope, or any Wave 3/4 source/adapter.
    Modified only: stage3/types.ts (one line), orchestrator/types.ts
    (SourceBuildContext), orchestrator/sources.ts (+63, all additions),
    cli/commands/stage3.ts (loadScope), .gitignore.
  - Live-verified per the bounded policy: 13 Step-1 probes + two dry-runs
    (himalayas+freehire+hn-hiring, then hn-hiring alone to confirm the fix).
    himalayas 209 fetched/23 passed, freehire 257/2, zero errors from any
    source. Prerank behaved as designed on a mixed batch: himalayas took 23 of
    25 slots on 43% of the batch while freehire got 2 on 57% — IDF discounting
    freehire's repetitive aggregated corpus. FOR WAVE 8 PACING: freehire's URLs
    point at the same ATS postings Himalayas indexes, so running both may be
    redundant in practice — evaluate once real runs accumulate, do not act now.
  - Every new source table row ships `enabled: false`. Nothing activated.
- LLM call throttle complete (2026-07-29, defect fix — NOT a construction wave):
  src/llm/. Fixes the rate-limit defect the first real activated Stage-3 run
  (Greenhouse) exposed. Read src/llm/README.md before touching Gemini call
  behavior; src/llm/CHANGELOG.md has the measured evidence.
  - ROOT CAUSE: the free tier limits requests per MINUTE, not just per day.
    Prerank protects the daily budget (500 RPD); NOTHING protected the
    per-minute rate. 25 opportunities × ~5 calls ≈ 123 requests fired as fast as
    the pipeline could emit them → 429 on a large fraction → 14 of 25 records
    written with DEFAULTED scores (six 3/0/3, eight 3/5/8) and ZERO
    opportunity-specific evidence reasoning, while the run reported success.
    Graceful degradation worked exactly as designed and that was the problem:
    it made unusable output look like a clean run. The regime never occurred
    before because manual Stage-1 intake feeds ONE opportunity at a time —
    Stage-3 activation created it, no engine changed.
  - SCOPE OF THE FIX: `src/engines/scoring/gemini.ts` is the ONLY engine file
    touched. Every engine already routes through `createGeminiClient` (verified:
    scoring, evidence-matching, application-package, outreach-package,
    follow-up, research all use `options.client ?? createGeminiClient()`), so
    one wrapper covers all twelve without an engine change. The fetch body is
    unchanged; it is wrapped in `throttle(...)` and the `!res.ok` throw became
    `HttpStatusError`.
  - THE LIMITER IS PROCESS-WIDE, NOT PER-CLIENT — this is load-bearing, do not
    "simplify" it to an instance field. The RPM ceiling belongs to the API KEY,
    not to a client object, and `score.ts:321` / `match.ts:308` each
    default-construct their OWN client when none is injected. A per-instance
    limiter would let N clients each pace to the full ceiling and multiply the
    real rate by N — reproducing the exact defect being fixed.
  - FAILURE SHAPE IS UNCHANGED BY DESIGN. After exhausted retries the ORIGINAL
    error is rethrown. `HttpStatusError` is an Error whose message is
    byte-identical to the pre-throttle one (`Gemini request failed: HTTP 429`);
    `status` is additive and read only inside src/llm. A test drives a real
    `computeScore` through an all-429 client and asserts the degradation path
    still fires (rule-pass only, confidence ≤ 0.4). If a future session changes
    what callers see thrown, every engine's degradation path is in play.
  - ENV VARS (all optional): `GEMINI_MAX_RPM` (default 12), `GEMINI_MAX_ATTEMPTS`
    (4 = 1 try + 3 retries), `GEMINI_RETRY_BUDGET_MS` (60000, a HARD ceiling on
    one call's backoff checked independently of attempts remaining — that, not
    the attempt count, is what stops a pathological all-429 sequence),
    `GEMINI_BACKOFF_BASE_MS` (2000, doubling, equal jitter),
    `GEMINI_BACKOFF_MAX_MS` (30000, also clamps `Retry-After`). 429 is the ONLY
    retried status. A malformed env value WARNS and uses the default rather than
    throwing — a throw there lands in an engine's catch and is re-reported as
    "the LLM failed", the exact invisible-failure class this removes.
  - RPM 12 PROVENANCE: the recorded ceiling is 15 RPM / 500 RPD (operator's
    reading of the AI Studio dashboard, see the Gemini model entry above), NOT
    re-verified 2026-07-29. 12 leaves ~20% headroom because the server's minute
    is a sliding window our fixed spacing cannot align with. If 429s reappear at
    a paced rate, check the dashboard before assuming a code defect.
  - MEASURED RUN COST (`npx tsx src/llm/scripts/simulate-run.ts` — real throttle,
    fake clock, NO live call; excluded from `vitest run` by filename, same
    convention as the Wave 3/4 live-verify scripts): ~4.9 Gemini calls per
    opportunity (spread 3–6: research 1 + scoring 1–2 + evidence 1–6), so a
    25-item run is 123 calls and takes **~10 minutes** at 12 RPM. API latency
    (~1.5s) is fully ABSORBED by the 5s pacing interval. OPERATING ENVELOPE:
    ~101 opportunities/day against 500 RPD ≈ 4 full runs of 25. A ~10-minute run
    is now the NORMAL shape of real discovery — fire it and walk away.
  - THE FINDING THAT FORECLOSES "just retry harder instead of throttling": the
    un-throttled regime is STRICTLY WORSE ON BOTH AXES, not a tradeoff.
    Simulated at 60 RPM / 60% 429: **13m 23s AND 14 calls lost permanently**.
    At 12 RPM / 0%: **10m 12s and none lost**. Throttling is faster *and*
    correct. Do not reopen this — it has been measured. (Also measured: a 5%
    residual 429 rate costs 5 SECONDS, not minutes.)
  - OBSERVABILITY: `oaos discover --stage3` prints a Gemini block under the run
    summary (total / rate-limited / recovered-on-retry / failed-permanently /
    time waiting), and names the remediation when calls fail permanently. The
    tally is ZEROED PER RUN in `cli/commands/stage3.ts` so it always describes
    the run just watched. Stage-3 ONLY — single-opportunity paths (`oaos intake`,
    Stage-2 discover) cannot hit a per-minute ceiling, and the same block there
    would be noise on every run.
  - TESTS NEVER SLEEP: time is an injected clock. The fake advances virtual time
    on zero-delay macrotasks, resolving the EARLIEST pending deadline first — a
    naive "advance t by ms on every sleep" clock lets parallel waiters all wake
    at the last one's deadline and HIDES the pacing bug (it did, on the first
    run of these tests). 34 new tests (throttle, gemini-client, config) + 4 in
    cli/tests/format.test.ts.
  - NOT FIXED: no request timeout — docs/known-issues.md #15. Pre-existing; the
    throttle makes it slightly more consequential because a hung call now holds
    the shared paced queue instead of stalling one opportunity.
- STAGE-3 ACTIVATION ALLOW-LIST (2026-07-29): `sources.test.ts` no longer
  asserts "no row is ever enabled" — that was correct through Wave 6 and went
  red the moment Greenhouse was deliberately activated. It now checks
  set-equality against a named `ACTIVATED_SOURCES` constant in BOTH directions:
  enabled-but-unlisted catches a casual flip, listed-but-disabled catches a
  stale entry after a deactivation. **PROTOCOL FOR EVERY FUTURE ACTIVATION: add
  the name to `ACTIVATED_SOURCES` AND flip `enabled: true` in sources.ts IN THE
  SAME COMMIT** (deactivation removes both, together). That pairing is the whole
  mechanism. Currently activated: `greenhouse`.
- WAVE 8 (SOURCE ACTIVATION) — IN PROGRESS. Dates, not SHAs: the activation
  commits are described by date deliberately. An earlier session's
  dangling-SHA references were cleaned up during the 2026-07-29 working-tree
  cleanup and must not be reintroduced.
  - ACTIVATED: `greenhouse` only, 2026-07-28. It covers FOUR company-board
    entries — Grafana Labs, ClickHouse, Chainguard, Tailscale (per-company
    toggles live in `src/discovery/stage3/registry.ts`). ALL 14 OTHER SOURCE
    ROWS REMAIN `enabled: false` in `src/discovery/orchestrator/sources.ts`,
    guarded by the activation allow-list protocol in the entry above.
  - THE CLEAN RE-RUN (2026-07-30) — the run that separated 429 damage from
    real defects. Verbatim result:
      source        fetched  cal  dedup  passed  gated  written  health
      greenhouse        419    0    127      25    267       25  ✓ healthy
      Prerank: 292 in → 25 passed, 267 gated (below_floor 89, beyond_k 178)
      Gemini: 120 calls · 0 rate-limited · 0 recovered on retry · 0 failed
              353s waiting (353s pacing, 0s backoff)
    ~6 minutes wall clock. ZERO rate limiting, ZERO backoff, ZERO failures —
    the throttle PREVENTED the burst rather than recovering from it, so the
    src/llm fix is confirmed working against a real activated source. MEASURED
    COST OF A 25-ITEM GREENHOUSE RUN: 120 Gemini calls / ~6 min at 12 RPM
    (the src/llm simulation's ~10 min estimate was conservative).
    CONSEQUENCE FOR DIAGNOSIS: anything still wrong in these records has NO
    rate-limit explanation available.
  - `writeOpportunity` UPDATES IN PLACE ON FINGERPRINT MATCH — load-bearing
    for how every future run is read. Of the 25 records written, only 6 were
    NEW; 19 were in-place updates of the 2026-07-29 batch. CORRECTED
    2026-07-30 (evening) diagnosis session: "RE-RUNS ARE SELF-HEALING" is
    TRUE FOR SCORES ONLY, not the whole record. `writeOpportunity`
    (src/persistence/write.ts) passes `score` into `opportunityFields`
    separately from `merge`'s output, straight from the fresh pipeline run —
    that's why the July 29 defaulted scores repaired correctly. But `merge`
    (src/engines/normalization/normalize.ts) folds onto `existing =
    parseOpportunity(record)`, and `parseOpportunity`
    (src/persistence/records.ts) FABRICATES description_raw/description_norm/
    comp_basis/remote/location/completeness/needs_enrichment/also_seen_in as
    blank on every read, regardless of what's actually stored. So every
    update-path write was ALSO PATCHing those fabricated blanks back over
    Notes, actively erasing description/remote/location/completeness on each
    re-run — the opposite of self-healing for everything except the two score
    columns. Fixed this session — see the 2-C entry below. A NEW-RECORD COUNT
    IS STILL NOT A COVERAGE MEASUREMENT — a company whose roles were already
    ingested contributes updates that are invisible in a new-record tally. Do
    not infer "source X fetched nothing" from "source X produced no new
    records".
  - RECORD STATE after the re-run: 42 records total — 25 from 2026-07-29
    (repaired in place by the 2026-07-30 run), 6 new on 2026-07-30, 11 older.
  - OPEN DEFECT 1 — EVIDENCE MATCHING PRODUCES NOTHING — RESOLVED 2026-08-04.
    `Evidence Assets` was EMPTY on every record as of 2026-07-30. Observed with
    ZERO FAILED GEMINI CALLS, so there was no rate-limit explanation. Root
    cause traced to the same upstream failure as Defect 2 below (empty
    `description_norm` reaching every downstream consumer, including Engine 3's
    evidence-matching candidate filter — nothing to match evidence against).
    Fixed as a side effect of the 2026-08-01 Greenhouse field-mapping +
    `stripHtml` fixes (see the dated entries below), not by any change to
    Engine 3 itself. Evidence: the 2026-08-04 verification run's match scores
    are materially higher and varied (5–21) versus the 2026-07-30 baseline's
    flat 6–15, with several Chainguard roles scoring 16–21 — consistent with
    evidence now contributing. NOTE: the Airtable `Evidence Assets` LINK COLUMN
    is still empty on every record — that is UNCHANGED, EXPECTED behavior per
    known-issues.md #17 (evidence links are never persisted, deferred to C9),
    not a sign this defect is still open. The defect was Engine 3 finding
    nothing to match, not Airtable failing to store what was found.
  - OPEN DEFECT 2 — `Remote: unknown` ON EVERY RECORD — RESOLVED 2026-08-04.
    These are Greenhouse boards for remote-first companies and several role
    titles contain "| Remote" literally. Normalization was not extracting the
    remote flag. THIS PATH NEVER INVOLVED GEMINI AT ALL, so there was no
    rate-limit explanation. Fixed by the Greenhouse content/location field
    mapping fix and the `detectRemote(role)` fix (both committed 2026-08-01,
    see the dated entries below). Verified 2026-08-04: all 25 records in the
    verification run carry `Remote: remote` (never `unknown`), including all
    three Grafana Labs "Staff Software Engineer - Databases SRE" anchors
    (Ireland → `Republic of Ireland (Remote)`, Spain → `Spain (Remote)`,
    Sweden → `Sweden (Remote)`).
  - CONSEQUENCE, NOT A THIRD DEFECT: match scores sit at 6–15 across the
    board and every record lands Tier C. That is what zero evidence
    contribution predicts, so TIERS ARE CURRENTLY MEANINGLESS RATHER THAN
    WRONG. CORRECTED 2026-07-30 (evening): "Fixing Defect 1 will likely
    re-tier the whole set" is KNOWN FALSE. `computeScore`
    (src/engines/scoring/score.ts) reads `evidence_match` as an in-memory
    argument passed straight from `runPipeline` (Engine 3's live output,
    src/pipeline/intake.ts) — it never reads the Airtable Evidence Assets
    link field. Persisting evidence links (deferred to C9, see
    docs/known-issues.md #17) changes what's stored in the link column; it
    moves no score and no tier. Do not tune the scoring rubric against these
    numbers for an unrelated reason either.
  - WATCH ITEM — CLOSED 2026-08-04 (was: NOT A DEFECT, not scoped for
    investigation). A Chainguard "Senior Partner Sales Engineer - Brazil" role
    scored 39 on quality and reached the top 25 in the 2026-07-30 run;
    suspected cause at the time was prerank vocabulary breadth (the operator's
    confirmed scope has 13 enabled fields, several broad). RESOLVED, not
    deferred: the role does not appear anywhere in the table after the
    2026-08-04 verification run. Finding recorded plainly — this was never a
    prerank vocabulary-breadth problem. It was the empty-`description_norm`
    defect (Defect 2 above): with real descriptions in play, genuine
    engineering roles outscore the sales role on content and it loses its
    slot in the top-25 prerank cut. No prerank change was made or is needed.
    RE-OPENED AS A GENERAL CONDITION 2026-08-06 — see docs/known-issues.md #25.
    The closure above was correct FOR ITS STATED CAUSE (empty descriptions) and
    incomplete as a finding: prerank has no engineering-vs-GTM discrimination,
    and that was masked by better content, not fixed. Second sighting recorded
    in the seniority wave entry below. Still not acted on.
- SENIORITY DIMENSION COMPLETE (2026-08-06) — a scope-module change, not a
  construction wave. Adds the operator's first way to express entry-level
  intent. `src/discovery/scope/seniority.ts` + schema v2 + two consumption
  sites. Read src/discovery/scope/README.md before touching it.
  - THE GAP IT CLOSED: `vocabulary.ts` mapped Preferences → PrerankVocabulary
    asymmetrically — domainTerms from the file, roleTerms AND negativeTerms
    from DEFAULT_VOCABULARY. There was no seniority axis anywhere in confirmed
    scope. The NEGATIVE-TERM half of that asymmetry is now closed; the
    `roleTerms` half REMAINS OPEN and is documented in vocabulary.ts's header.
  - SHAPE: `Preferences.seniority = { levels: [{level, excluded, terms}],
    entry_level_query_modifier }`. Five levels, CLOSED SET (senior / staff /
    principal / lead / management) — unlike `fields` there is no `add` path,
    because an operator-authored term would be an unreviewed entry in an
    unconditional pre-scoring gate. The modifier is a SEPARATE boolean, not
    derived from `levels`: excluding filters what came back, the modifier
    rewrites what third-party APIs are asked for. Two consequences, two
    confirmations.
  - THE EXPANDED TERMS ARE PERSISTED, not expanded from config at read time
    (operator ruling, overruling the ScopeField precedent). ScopeField expands
    a POSITIVE signal — worst case it matches more of what you wanted. This
    expands a NEGATIVE, unconditional, pre-scoring gate — worst case it
    silently deletes opportunities the operator never sees. A term-list edit is
    therefore a scope change, and D15 requires re-confirmation for those.
    Config MAY GAIN terms freely (they surface as `available` / `<NEW TERMS>`
    and are taken only by an explicit `adopt s<n>`); config REMOVING a term
    invalidates every file that persisted it, loudly, by design.
  - VERSION 2 + MIGRATION. A v1 file is REJECTED with an actionable message,
    never upgraded or defaulted. THE NON-OBVIOUS PART: `setup-scope` reads the
    existing file to carry ticks forward, so a strictly-rejecting read would
    make the one command that fixes a v1 file the one command that cannot open
    it. Hence the split — `loadPreferences`/`parsePreferences` (CONSUMPTION,
    strict on version) vs `loadBaseline`/`parseBaseline` (BASELINE ONLY,
    version-tolerant, returns a `ScopeBaseline` and never a `Preferences`).
    Unforgeability holds: a tolerated v1 file still cannot become a persisted
    scope without the reducer and a confirmed `buildPreferences`.
  - PROPOSED UNTICKED, always. Nothing excluded, modifier off. Sharper reason
    than the usual under-propose policy: it makes the migration
    BEHAVIOUR-NEUTRAL — re-confirming without touching the section reproduces
    the previous discovery exactly.
  - A1 IS COMPOSITIONAL, NOT BUDGETARY. Measured 2026-08-06: both arms passed
    EXACTLY 25 because `maxPerRun` binds in both. The gate REALLOCATES the 25
    slots. It does not raise yield, and it does not save a single Gemini call.
    Any earlier framing in this wave — including in the wave prompt — that it
    "raises effective yield" is MEASURABLY WRONG.
  - THE RULING IS SCOPED TO `maxPerRun: 25`. 171 of 323 items were gated, but
    only 17 were in the control's passed 25 — the other 154 sit in the
    `beyond_k`/`below_floor` tail BECAUSE k IS SMALL. All 17 were genuine
    Senior/Staff/EM/Senior-PM titles (zero false positives in the visible set),
    which is why A1 SHIPS AS BUILT. A LARGER `maxPerRun` EXPOSES MORE OF THE
    154, including the six body-prose false positives named in
    docs/known-issues.md #23. IF `maxPerRun` EVER CHANGES, RE-RUN THIS
    MEASUREMENT BEFORE TRUSTING THE GATE AT THE NEW k.
  - A3 SHIPS WIRED AND `enabled: false` (operator ruling). himalayas/freehire/
    adzuna compose the modifier inside `searchUrlFor`, DOWNSTREAM of
    `deriveQueryTerms` — it decorates a query string and never adds one, so
    MAX_QUERY_TERMS (15), one-page-per-query and drop-and-report are intact BY
    CONSTRUCTION. remotive has no query parameter at all; hn-hiring's scope
    drives its PREFILTER (an OR — a modifier would WIDEN it); company_board
    sources send no query. V2 measured no collapse on Himalayas (227→189
    fetched, 83% retained) BUT ran with exclusions ACTIVE IN BOTH ARMS, so it
    measures the modifier's MARGINAL effect on top of A1, not A3 in isolation.
    ADZUNA'S 4-TOKEN QUERY (`<term> remote entry level`) IS UNPROBED and is the
    open collapse risk — probe it before enabling.
  - SECOND SIGHTING of the GTM-vs-engineering condition: with exclusions
    active, ClickHouse *Commercial Account Executive* ×2 and Chainguard *Field
    Marketing Manager - CEUR* floated into the passed 25. They did not become
    more relevant — engineering roles above them were removed. Direct
    consequence of A1 being compositional. docs/known-issues.md #25. NOT acted
    on; do not change the vocabulary, prerank config, or the rubric for it.
  - NOTED, NOT BUILT: `runStage3` returns COUNTS only — no items, no
    fingerprints — and `processItem` is never called in a dry run, so run-level
    corpus membership is not observable. Verifying the passed SETS needed a
    record/replay harness in `scripts/verify-seniority.ts`. Returning deduped
    fingerprints from the orchestrator would remove that need; out of scope.
  - 96 new tests (2 new files: scope/tests/seniority.test.ts,
    stage3/tests/seniority-modifier.test.ts). Suite 934 → 1030 (76 → 78 files).
    Zero diff to the 12 engines, pipeline, persistence, `src/discovery/prerank/`
    (NOT ONE LINE — DEFAULT_VOCABULARY untouched; prerank receives a richer
    vocabulary through the injected-data seam and learns nothing about
    seniority), orchestrator/sources.ts, the ACTIVATED_SOURCES allow-list, the
    registry, or any Stage-3 frame file.
- Test count: 1030 passing (78 test files) — `vitest run`
  (re-verified 2026-08-06. NOTE: this entry read "924 passing (74 files)" until
  then and was stale by 10 tests / 2 files — the 2026-08-01 greenhouse-seam
  additions were never recorded here. Measure before quoting it.)
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
- BEFORE REPORTING A SESSION AS PUSHED, VERIFY IT: run
  `git rev-parse main origin/main` and confirm the two SHAs MATCH.
  Waves 3, 4 and 6 were each reported "merged and pushed" and none of
  them were — the merges happened locally, the push did not, and
  origin/main sat at Wave 2 (e022d7a) for three sessions while
  everything since existed only on the operator's laptop, unbacked.
  Discovered 2026-07-29 during the working-tree cleanup. The claim gets
  CHECKED, never asserted from having run the command earlier in the
  session or from intending to.
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
- Stage 3 orchestration (Phase 1 Wave 6): COMPLETE, pending operator go-ahead
  to branch/commit/merge. src/discovery/orchestrator/ + cli/commands/stage3.ts
  — see the Wave 6 entry above for the three rulings, the source table and how
  to toggle it, the health file posture, and the one live-caught bug (unsliced
  company registry). 85 new tests; full suite 747 green (63 files). Zero diff
  to the 12 engines, pipeline, persistence, prerank, scope, or any Stage-3
  frame/source/adapter file. Modified only: .gitignore, cli/index.ts (help),
  cli/commands/discover.ts (+8, a --stage3 branch; the Stage-2 path is
  unchanged), cli/commands/report.ts (health section), cli/format.ts.
  NOTE: preferences.json NOW EXISTS on the operator's machine (created
  2026-07-27 via a confirmed `oaos setup-scope`, all 13 fields enabled) — that
  is why the live dry-run was possible. Still never write it from a session.
- Query-first net sources (Phase 1 Wave 5): COMPLETE, committed 2026-07-29
  (straight to main, no feat/ branch — see the working-tree cleanup note
  below). src/discovery/stage3/sources/{himalayas,freehire,
  adzuna,remotive,hn-hiring}.ts + src/discovery/stage3/query/* — see the Wave 5
  entry above for the three rulings, the five query strategies and why they
  differ, the three structural constraints, the HN lift + ratio guard, and the
  admission total. 143 new tests; full suite 890 green (71 files). Zero diff to
  the 12 engines, pipeline, persistence, prerank, scope, or Waves 3/4.
  ACTION REQUIRED BY THE OPERATOR before Adzuna can run: copy `app_id`/`app_key`
  from research/phase0c/adzuna-keys.txt into .env as ADZUNA_APP_ID /
  ADZUNA_APP_KEY. Without them Adzuna builds fine and reports a clear error.
- PHASE 1 CONSTRUCTION IS COMPLETE. Remaining: Wave 7 registry expansion (the
  locked 8-entry COMPANY_REGISTRY; note the logged finding that ClickHouse
  appears to run an Ashby board despite being registered as greenhouse) — or
  Wave 8 source activation (operator-paced: flip rows in
  src/discovery/orchestrator/sources.ts, run `--source <name> --dry-run`
  first) — or operator-chosen priority.
- Wave 8 BEGAN: greenhouse activated 2026-07-28. Its first real run (415 fetched
  → 25 preranked → 25 written) exposed the Gemini rate-limit defect fixed in
  src/llm (see that entry above) and left main red on the old activation guard
  (now an allow-list). Both fixed 2026-07-29; suite 924 green.
  THE CLEAN RE-RUN HAPPENED 2026-07-30 and confirmed the throttle fix (0
  rate-limited / 0 failed of 120 calls) while isolating TWO REAL DEFECTS —
  empty Evidence Assets and `Remote: unknown`. Full numbers, the
  fingerprint-update semantics, the record state, and both defects are recorded
  in the "WAVE 8 (SOURCE ACTIVATION)" entry in Project state above. Read that
  before interpreting any later run.
- WORKING-TREE CLEANUP (2026-07-29) — why the history looks the way it does.
  Wave 5 was reported complete but never committed: its files sat untracked for
  a session, and its `sources.ts` block got swept into the Greenhouse activation
  commit, which therefore imported six modules that existed NOWHERE IN GIT. That
  commit did not build from a clean clone — a bisect trap and a clone trap. It
  was unpushed (origin/main was still at Wave 2), so it was replaced rather than
  patched over: `git reset` to the Wave 6 merge, then three honest commits —
  Wave 5, the rate-limit fix, and the activation (flip + guard allow-list
  TOGETHER, since the protocol makes any split of those two produce a red
  commit). Straight to main, no reconstructed feat/ branch: a fabricated merge
  would have been the one dishonest thing in a history being cleaned up for
  misrepresenting what happened. Each commit was verified green in a CLEAN GIT
  WORKTREE, not in the working tree — untracked files there would have been
  discovered by vitest and tested against the wrong commit's code.
- LLM throttle fix: COMPLETE, committed 2026-07-29.
  src/llm/ + src/engines/scoring/gemini.ts (the only engine file touched) +
  cli/format.ts (`formatGeminiStats`) + cli/commands/stage3.ts (reset before the
  run, print after) + sources.test.ts (activation allow-list) +
  docs/known-issues.md #15 (no request timeout — logged, not fixed).
  Full suite 924 green (74 files), up from 890/71. Zero diff to the 12 engines
  (besides gemini.ts), pipeline, persistence, prerank, scope, orchestrator
  logic, or any Stage-3 source. No live Gemini call was made this session.
- The clean Greenhouse re-run: DONE 2026-07-30. Verdict: the throttle fix is
  confirmed (120 calls, 0 rate-limited, 0 failed, 0 backoff, ~6 min) and BOTH
  audited symptoms are REAL DEFECTS, not throttling fallout. Neither has a
  rate-limit story available.
- DIAGNOSIS (2026-08-01) AND FIX: root cause of both Wave-8 defects was the
  Greenhouse adapter not mapping `content`/`location` into the keys Engine 1
  reads, compounded by an entity-decode-ordering bug in `stripHtml` and
  `detectRemote` never being fed `role`/title text. Four commits landed
  2026-08-01: `fa1c5d7` (narrow `writeOpportunity`'s update PATCH to
  `date_found` + scores), `53a2fe2` (map Greenhouse content/location into keys
  Engine 1 reads), `c90f882` (feed role/title into `detectRemote`), `e7907e0`
  (decode HTML entities before stripping tags). The dedupe/thin-company-
  extraction question raised 2026-07-30 (see prior THIRD OBSERVATION, now
  removed from this file) turned out not to require separate investigation —
  fixing the field mapping resolved it as a side effect, confirmed by the
  2026-08-04 verification run.
- WAVE-8 VERIFICATION RUN — COMPLETE 2026-08-04. Confirms both Wave-8 defects
  and the Chainguard watch item are RESOLVED (see the "OPEN DEFECT 1", "OPEN
  DEFECT 2", and "WATCH ITEM" entries in the WAVE 8 section above for full
  before/after detail). Run against a genuinely cleared Opportunities table
  (11 control-group records only, 0 `greenhouse:*`, confirmed by a read-only
  precheck before running):
  ```
  source          fetched  cal  dedup  passed  gated  written  health
  greenhouse         432    0    124      25    283       25  ✓ healthy
  Prerank: 308 in → 25 passed, 283 gated (below_floor 92, beyond_k 191)
  Gemini: 193 calls · 0 rate-limited · 0 recovered on retry · 0 failed
          561s waiting (561s pacing, 0s backoff)
  ```
  ~16m 48s wall clock (2026-08-04T13:41:12Z → 13:58:00Z). 36 records total
  after the run: 11 control-group + 25 created today via the CREATE path
  (confirmed by `createdTime`, not inferred). Source split: Grafana Labs 12,
  ClickHouse 5, Chainguard 5, Tailscale 3. Tier distribution: 19 C / 6 B — the
  first non-uniform tier spread since Wave 8 began (2026-07-30 baseline was
  25/25 Tier C).
  - COST ENVELOPE REVISED: a 25-item Greenhouse run now costs ~193 Gemini
    calls / ~16 min, up from the ~120 calls / ~6 min measured 2026-07-30. The
    increase is expected and caused by the fix itself — populated descriptions
    mean more content per item to score, where the pre-fix runs were scoring
    near-empty text. Revised daily envelope: **roughly 65 opportunities/day
    against the 500 RPD free-tier cap**, down from the pre-fix ~101/day
    estimate in the src/llm entry above. This is a real input to Wave 8
    sequencing — activating a second source family compounds this, it does
    not add on top of a stale lower estimate.
  - FALSE-PREMISE INCIDENT (2026-08-02, cost ~386 Gemini calls across two
    runs): a bulk cell-clear in the Airtable UI (select rows → Delete/Backspace
    on cells) empties field VALUES but does not remove ROWS — record IDs and
    fingerprints survive intact. Two verification attempts were run against a
    table the operator believed was cleared (31 Greenhouse rows "deleted") but
    which still held those 31 rows, now reduced to `Notes: "\n"`, `Tier: C`,
    `Total Score: 0` with every other field blank. Both runs' writes correctly
    took the UPDATE path (matching the surviving fingerprints) and correctly
    patched only `date_found` + scores (the 2026-08-01 `fa1c5d7` fix working as
    designed) — which is exactly why "25 written, 0 errors" reconciled with
    "nothing new visible" in the table, and why the runs could not exercise the
    create path or produce evidence for the other three fixes. OPERATIONAL
    LESSON: counting total records (and checking none carry a `greenhouse:*`
    source) before a verification run is the precheck that catches this — a
    43-mostly-blank-row table and an 11-row table are not visually
    distinguishable by row count alone in a quick glance, but are trivially
    distinguishable by a read-only field-content query. The actual row-delete
    fix is the Airtable row context menu → "Delete records", not cell
    clearing. This has no code-level consequence — it is an operator-tooling
    lesson, not a defect in any engine, adapter, or the persistence layer.
- SENIORITY DIMENSION: COMPLETE 2026-08-06, staged, NOT PUSHED. See the
  "SENIORITY DIMENSION COMPLETE" entry in Project state above for the schema,
  the migration split, the two consumption sites and every measured number.
  preferences.json was re-confirmed by the operator (v2, all 13 fields carried
  forward, all five seniority levels excluded, modifier off) — created by a real
  `oaos setup-scope`, never by a session. Live-verified per the bounded policy:
  40 requests total, zero Gemini (V1 greenhouse A/B with record+replay, V2
  himalayas modifier A/B, V3 passed-set diff over one held corpus).
- ALSO STILL OPEN, unchanged: Wave 7 registry expansion (the locked 8-entry
  COMPANY_REGISTRY, incl. the logged ClickHouse-runs-Ashby finding) and the
  local web UI (D16), neither started. Freelance/gig discovery remains deferred
  by locked decision. Adzuna's 4-token query is unprobed (see the seniority
  entry) and A3 stays `enabled: false` until it is.
