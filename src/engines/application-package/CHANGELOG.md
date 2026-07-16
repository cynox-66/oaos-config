# Changelog — Application Package Engine (Engine 6)

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
