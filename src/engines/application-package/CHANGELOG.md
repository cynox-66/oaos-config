# Changelog — Application Package Engine (Engine 6)

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
