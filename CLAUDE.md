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
- Test count: 553 passing (40 test files) — `vitest run`
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
- NEXT UP (hold for direction): Stage 3 (automated per-source feeds:
  RSS / official APIs) — first Stage-3 source is also the prerank
  gate's first live caller — or Wave 5 query builders (first consumer of
  preferences.json) — or operator-chosen priority.
