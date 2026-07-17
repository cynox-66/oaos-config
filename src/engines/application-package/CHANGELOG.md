# Changelog — Application Package Engine (Engine 6)

## [Layered fabrication check] — 2026-07-16

Fixed known-issue #7 (fabrication_check over-conservatism) with a
defense-in-depth redesign. The old soft rule counted EVERY unsupported token —
including English function words ("the", "your", "have") — so ordinary prose
flagged on grammar alone; nearly every real letter came back flagged and the
resulting regen discarded the D8 critic's edits (#11).

### Layer 1 — hard, pure, deterministic (fabrication.ts; the un-bypassable floor)
- Retained: years-of-experience rule, title-keyword rule (unchanged).
- Added: puffery rule — `PUFFERY_PATTERNS` (config.ts) flagged unless the
  phrase is verbatim in the base resume; hyphen/space tolerant; includes
  digit-less experience claims ("many years", "years of experience") that the
  YoE regex cannot see.
- Narrowed: the token rule now counts only unsupported CONTENT tokens —
  `CONNECTIVE_STOPWORDS` (function words, letter courtesies, generic rhetoric;
  curated so nothing naming a tech/scale/achievement/credential is exempt)
  never count; threshold tightened 3 → 2 since all counted tokens are now
  content-bearing. Unknown words fail CLOSED (still count).

### Layer 2 — semantic audit (semantic.ts, new; additive only)
- ONE extra Gemini call audits the letter for concrete factual claims
  unsupported by the full base resume + inventory + opportunity; returns
  structured JSON naming offending sentences.
- THE INVARIANT (enforced structurally in `checkFabricationLayered`): final =
  Layer-1 flags UNION Layer-2 flags. Layer 2 can escalate a pass to a flag but
  can never clear a hard flag. FAIL-CLOSED: LLM error/unparseable verdict →
  result degrades to the Layer-1 verdict with `semantic_degraded=true`,
  surfaced in `notes` ("verify claims manually") + console.warn — an LLM
  failure never silently passes anything.

### Budget & determinism
- Gemini calls per package: happy path 3 (was 2), worst case 5 (was 3) —
  draft + critic + semantic (+ regen + semantic re-check). Well within the
  15 RPM / 500 RPD limits at pipeline volume.
- NOTE: the check is no longer fully deterministic — the same letter may get
  different Layer-2 verdicts run to run. Layer 1 remains pure and
  deterministic; only ADDITIONAL flags vary.

### Tests
- fabrication.test.ts: #7 connectives pass; regression pins on YoE / title /
  invented-project; puffery rule incl. traceable-puffery pass and
  hyphen-variants; narrowed-token boundary (3 flags / 2 passes); borderline
  connective-wrapper-with-real-claim still flags.
- semantic.test.ts (new): parser null-vs-[] discipline; full-serialization
  prompt; invariant (escalate / never-clear / dedupe); fail-closed (throw,
  garbage, flagged+outage → still flags).
- package/critic call budgets updated (3/5); degradation-note visibility test.
- Suite: 371 → 402.

### Post-validation refinements (same day, after the live AccuKnox re-run)
The re-run eliminated the #7 grammar-noise flags (6 flagged incl. pure
connectives → 3, all substantive) and surfaced three precision findings,
fixed here:
- Layer-2 prompt: co-equal-sources instruction added — the auditor had
  flagged an inventory-supported claim (HyperHID) by inventing a "base
  resume is primary" hierarchy. Layer 2 remains add-only, so this only
  removes false positives.
- Allowed corpus: evidence inventory URLs included — citing an evidence
  record's own address (e.g. the krkn PR link) had counted as suspicious
  tokens. Trade-off accepted: "https/github/com" become corpus tokens, so a
  short fabricated-URL sentence may now duck the token rule alone; Layer 2
  still audits it.
- Stopwords: ordinals only (first, second, third, finally). Professional
  vocabulary ("equipped", "robust", "maintainable", "proficiency") stays
  claim-bearing and counted, per the fail-closed curation rule — so true
  claims in fresh paraphrase vocabulary can still flag (tracked as
  known-issue #11's residual; regen ordering deliberately untouched).
- Suite: 402 → 405.

The check is now five nets, in evaluation order: (1) years-of-experience
regex, (2) title keywords, (3) puffery phrases, (4) unsupported-content-token
count — all pure, deterministic, LLM-free, computing an un-bypassable floor —
then (5) one semantic Gemini audit whose flags are set-unioned ON TOP of the
floor: it can escalate a pass to a flag, can never clear one, and fail-closes
to the floor (visibly, via notes + semantic_degraded) when the LLM errors.

## [Reviewer pass (D8)] — 2026-07-16

Added the drafter-reviewer critic pass per research decision D8
(`~/Desktop/oaos-research/DISCOVERY-SYNTHESIS-DECISIONS.md`), addressing the
generic-cover-letter finding from the first real run. Pattern borrowed as an
idea from MadsLorentzen/ai-job-search's drafter-reviewer workflow (MIT); no
code copied. Safety guarantees unchanged: the pure fabrication trace-check
runs on the final letter and is never overridden by the critic; no "minor
stretch" allowance (D9).

### Added
- `critic.ts` — `buildCriticPrompt` (pure; sharpen-only, never-add-facts
  contract), `parseCriticEdits` (tolerant; any parse failure degrades to zero
  edits), `applyEdits` (pure exact-string sentence replacement, skips
  non-matching edits), `CriticEdit` type.
- Reviewer pass wired into `generateCoverLetter` between the initial draft and
  the existing check/regen safety net: draft → critic (ONE extra Gemini call)
  → apply edits → fabrication + word-count check on the revised letter → the
  existing regenerate-once-then-truncate budget. Total Gemini calls ≤3 (was
  ≤2); happy path 2.
- `CoverLetterResult.criticEditsApplied`; `notes` gains
  `"reviewer pass: N edit(s) applied."` (reported as 0 when a regeneration
  replaced the critic-revised text).
- Tests (`tests/critic.test.ts`): parse/apply pure units; sharpening happy
  path (2 calls); the load-bearing safety test — a critic edit injecting an
  unverifiable claim ends in `fabrication_check="flag"` with the offending
  sentence named, exactly 3 calls, no loop; graceful degradation on
  unparseable critic output. Existing call-count tests updated for the new
  budget. Suite: 361 → 371.

### Changed
- `prompt.ts`: `contextBlock` and `proofBlock` exported (reused by the critic
  prompt). No behavior change.

## [Initial] — 2026-06-24

Implemented Engine 6 (Application Package Engine) per `docs/engine-specs.md`
Section 6, with all spec gaps resolved by operator direction (inventory in the
request; fabrication algorithm; combined regenerate-once-then-truncate word-cap
budget; 2 proof points; reorder-only resume variant with domain+evidence
relevance; fabrication scope = cover letter). Scope is Engine 6 only; Engines
1–5 and 7–12 are untouched.

### Added
- `BaseResume` (+ `ExperienceEntry`/`ProjectEntry`/`EducationEntry`),
  `OperatorProfile`, `PackageRequest` (with `inventory: Evidence[]`),
  `ApplicationPackage`, and `FabricationResult` types.
- `buildResumeVariant` — pure, deterministic reorder of projects / experience /
  bullets by relevance to `opportunity.domain ∪ matched-evidence tech_tags &
  domains`; reorders only (no invention, no dropping); stable sort.
- `checkFabrication` — pure cover-letter trace-check: years-of-experience and
  unlisted-title hard rules + a >3-unsupported-token soft rule over a corpus of
  base resume + inventory + opportunity text; returns pass/flag + flagged
  sentences. Documented to run on the letter only (the variant cannot fabricate).
- `buildCoverLetterPrompt` / `buildRegenPrompt` / `toneFor` — pure prompt
  construction with tone by category, the hook→2-proof→fit/ask structure, and the
  word cap.
- `generateCoverLetter` — Gemini generation with the single combined
  regeneration budget (fabrication OR word-count failure → one retry) and a final
  hard truncation to 250 words at a sentence boundary; ≤2 Gemini calls.
- `buildApplicationPackage` — orchestrator: resume variant + proof-evidence
  resolution + cover letter + notes (proof-thin / fabrication / truncation /
  coverage gap). Gemini client injectable.
- Reuses Engine 2's `createGeminiClient`; resolves `EvidenceMatch` ids against the
  inventory (as Engine 3's `MatchRequest` does).
- Vitest suite (18 tests): resume variant, fabrication, tone, regeneration
  budget, persistent flag, never-assert, sparse evidence, evidence_cited, and
  word-cap truncation. Gemini mocked throughout.
- Engine README and TSDoc.

### Tooling
- No new dependencies. Cover letter is the only LLM step; everything else is
  pure. No `tsconfig` added (repo runs `.ts` via `tsx`).
