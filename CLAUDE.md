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
- Test count: 287 passing (27 test files) — `vitest run`
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
- NEXT UP (hold for direction): Stage 2 discovery.
