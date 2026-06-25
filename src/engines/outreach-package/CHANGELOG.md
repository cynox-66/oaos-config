# Changelog — Outreach Package Engine (Engine 7)

## [Initial] — 2026-06-24

Implemented Engine 7 (Outreach Package Engine) per `docs/engine-specs.md`
Section 7 + STEP 2, with all spec gaps resolved by operator direction
(single-evidence URL assertion in the orchestrator; github no-opportunity draft
shape + no-regen; body-only counts; subject ≤10-words-only assertion;
substring banned-phrase + first-word opener matching). Scope is Engine 7 only;
Engines 1–6 and 8–12 are untouched.

### Added
- `Channel` (email / linkedin_connect / linkedin_dm / github / slack),
  `AskType`, `OutreachRequest`, and `OutreachDraft` (+ `constraint_violations`)
  types.
- `constraints.ts` — pure `checkConstraints(draft, channel)`: per-channel length
  limits, the 11-phrase banned hard gate (case-insensitive substring over
  subject+body, apostrophe-normalized), and the first-word opener rule.
- One pure prompt builder per channel under `prompts/` (email / linkedin connect
  + dm / github / slack), shared context/evidence/rules fragments, the response
  parser, and the regeneration wrapper; `selectPromptBuilder` / `buildPrompt` /
  `buildRegenPrompt`.
- `draft.ts` orchestrator — resolves the single `ranked[0]` proof evidence,
  generates the draft, runs `checkConstraints` + the inventory-aware
  single-evidence URL check, regenerates once on failure (≤2 Gemini calls), and
  short-circuits the github `has_genuine_opportunity=false` signal to the special
  draft. `customization_notes` always populated.
- `config.ts` — channel limits, banned phrases, greeting openers, ask-type
  intents, call cap.
- Reuses Engine 2's `createGeminiClient`. Did NOT reuse Engine 6's fabrication
  module (different concern — confirmed with operator).
- Vitest suite (27 tests): length limits, banned phrases (6 sampled), opener
  rule (incl. "High availability" non-trigger), single-evidence referencing,
  github no-opportunity + genuine paths, regeneration budget, always-populated
  notes, and prompt purity. Gemini mocked throughout.
- Engine README (constraint table + banned list) and TSDoc.

### Tooling
- No new dependencies. Draft generation is the only LLM step; all gating is
  pure. No `tsconfig` added (repo runs `.ts` via `tsx`).
