# Changelog — Stage 2 Discovery (Email-Alert Parsing)

## [Initial] — 2026-07-08

Implemented Stage 2 discovery per `ROADMAP.md` Discovery Architecture
("Saved searches + email alerts → parse → normalize → pipeline"), with the
scope-corrected priority: job / remote / freelance sources are first-class, not
OSS-biased. Input mechanism confirmed with operator: **file-based** (full raw
email text, headers + body) — **not** live Gmail OAuth. Scope is
`src/discovery/stage2/` only; no engine, adapter, or pipeline code changed.

### Added
- `AlertSource` union (6 sources) and `ParsedListing` type (`types.ts`).
- Six pure per-source parsers, each `parseAlert(rawText): RawItem[]` with a
  documented listing shape + detection heuristic:
  1. `linkedin.ts` — LinkedIn Jobs digest
  2. `indeed.ts` — Indeed job alert
  3. `wellfound.ts` — Wellfound / AngelList startup jobs
  4. `weworkremotely.ts` — We Work Remotely
  5. `upwork.ts` — Upwork saved search (`source_type: freelance`)
  6. `remoteok.ts` — Remote OK
- `parse.ts` — `detectSource(email)` (From:-domain primary, body fallback,
  `null` on unknown — never guesses) + `parseAlertEmail(email)` dispatcher.
- `parsers/shared.ts` — pure helpers: header/body split, `emailDateIso` (from
  the `Date:` header, keeping parsers pure), `htmlToLines` (reuses Engine 1's
  `stripHtml` — no new HTML dependency), `jobBlocks` (multi-listing split
  anchored on job-link `<a href>`s), `looksLikeComp`, and `toRawItem`.
- `index.ts` public surface; `README.md`.
- 42 tests (`tests/parse.test.ts`): per-parser listing count, company/role/url
  populated, malformed/partial input → no throw, source detection incl.
  unknown → null, dispatcher, and the Engine 1 seam (parsed RawItem →
  `normalize()` → Opportunity; Upwork → Freelance).

### Design
- Parsers emit structured-object `RawItem.raw_payload` that maps 1:1 onto the
  fields Engine 1's `job_board` adapter already reads — so no new adapter is
  needed. Partial data is intentional; `completeness`/`needs_enrichment` handle
  it downstream.
- No network / no LLM in this layer. Transport (file read, CLI wiring) is a
  separate follow-up; the pure parsing boundary is transport-agnostic so a
  future live-Gmail transport needs zero parser changes.

### Out of scope (unchanged)
- Engines, pipeline, persistence, CLI wiring, live Gmail OAuth, OSS/GitHub
  (Stage 3) parsers.
