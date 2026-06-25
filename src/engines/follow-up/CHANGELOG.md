# Changelog — Follow-Up Engine (Engine 8)

## [Initial] — 2026-06-24

Implemented Engine 8 (Follow-Up Engine) per `docs/engine-specs.md` Section 8 +
STEP 2, with all spec gaps resolved by operator direction (output step =
request.step+1; OSS suppression from step>=1; terminal_reason encodes status;
LinkedIn channel-switch is a note only; follow-up draft fields; now is
non-gating). Scope is Engine 8 only; Engines 1–7 and 9–12 are untouched. Engine
7's config/constraints were NOT modified.

### Added
- `OutreachStatus` / `TerminalReason` enums, `FollowUpRequest`, and
  `FollowUpState` types.
- `computeNextStep` — pure, wall-clock-independent state machine: response/
  bounce/cancel halt first, then OSS suppression (step>=1), then the step-3 hard
  cap, else schedule FU(step+1) due at sent_date + {4,10,17} days. `output.step`
  never exceeds 3.
- Per-step prompt builders (FU1 add value / FU2 new angle + question / FU3
  graceful close), the response parser, and `checkFollowUpConstraints` — a pure
  per-step word-cap (60/50/40) + banned-phrase + opener check.
- `buildFollowUp` orchestrator — runs the state machine; terminal returns
  immediately (no draft, no Gemini call); otherwise generates the draft,
  regenerates once on a constraint failure (≤2 Gemini calls), and adds the
  LinkedIn→email channel-switch note for FU2.
- `config.ts` — schedule offsets, per-step word caps, and the follow-up-specific
  banned phrases combined with Engine 7's list.
- Reuses Engine 7's `BANNED_PHRASES` + `GREETING_OPENERS` + `wordCount` +
  `normalizeText` (imported, not copied) and Engine 2's `createGeminiClient`.
- Vitest suite (24 tests): due dates, terminal conditions, hard cap, OSS
  suppression (incl. step-0 FU1), per-step word caps with regeneration, banned
  phrases, new-evidence injection, the channel-switch note, and the terminal
  no-Gemini-call guarantee. Gemini mocked throughout.
- Engine README (state-machine diagram + per-step table) and TSDoc.

### Tooling
- No new dependencies. Only the draft uses the LLM; the state machine is pure.
  No `tsconfig` added (repo runs `.ts` via `tsx`).
