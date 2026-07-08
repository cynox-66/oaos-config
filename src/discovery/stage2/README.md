# Stage 2 Discovery — Email-Alert Parsing

Semi-automated discovery: turn job/freelance **alert emails** into canonical
`RawItem`s that flow through the existing `normalize()` → `runPipeline` path.
This is the middle maturity stage between Stage 1 (manual paste) and Stage 3
(automated feeds) in the ROADMAP Discovery Architecture.

- **Cost:** ₹0. **Maintenance:** low — one isolated parser per alert format.
- **Scope:** parsing only. No network, no LLM, no engine changes. Every function
  here is pure and unit-tested.

## Input mechanism (file-based, by design)

Alerts are supplied as **full raw email text (headers + body)** — e.g. an
`.eml` export or Gmail's "Show original". We deliberately do **not** use the
live Gmail API:

- Stage 2's whole point is low maintenance; OAuth adds a token-refresh
  lifecycle and a second Google auth surface.
- The parsers are pure `parseAlert(rawText) → RawItem[]` regardless of
  transport. A live-Gmail transport, if ever needed, is a Stage 3 upgrade that
  requires **zero** parser changes.

Operator flow: label job alerts in Gmail → export/drop them (headers included)
where the intake step reads them. The full-email input matters because
**source detection keys off the `From:`/`Subject:` headers** — far more reliable
than fingerprinting a body-only paste.

> The watched-folder read and CLI wiring are a separate follow-up task. This
> module is the pure parsing + detection layer only.

## How it flows into the pipeline

```
raw email (headers + body)
  → detectSource()          identify format by From: domain (Subject secondary)
  → parseAlertEmail()       dispatch to the right per-source parser
  → RawItem[]               one per listing (structured object payload)
  → normalize(item)         Engine 1 (unchanged)
  → runPipeline(item, …)    intake pipeline (unchanged)
```

Each `RawItem.raw_payload` is a structured object (`company`, `role`,
`description`, `location`, `comp`) that maps 1:1 onto the fields Engine 1's
`job_board` adapter already reads — so **no new adapter is required**. Partial
extraction is fine: Engine 1's `completeness` / `needs_enrichment` handles
missing fields.

`source_type` per source: LinkedIn / Indeed / Wellfound / We Work Remotely /
Remote OK → `job_board`; **Upwork → `freelance`** (→ Engine 1 assigns the
`Freelance` category).

## Supported sources (priority order)

| # | Source | `source_type` | Detection (From: domain) |
|---|--------|---------------|--------------------------|
| 1 | LinkedIn Jobs | `job_board` | `linkedin.com` |
| 2 | Indeed | `job_board` | `indeed.com` |
| 3 | Wellfound / AngelList | `job_board` | `wellfound.com` / `angel.co` |
| 4 | We Work Remotely | `job_board` | `weworkremotely.com` |
| 5 | Upwork (freelance) | `freelance` | `upwork.com` |
| 6 | Remote OK | `job_board` | `remoteok.com` / `remoteok.io` |

Each parser documents its own listing shape and detection heuristic in its
file header.

## Public API

```ts
import { parseAlertEmail, detectSource } from "./discovery/stage2";

const items = parseAlertEmail(rawEmailText); // RawItem[] (empty if unknown/none)
const source = detectSource(rawEmailText);   // AlertSource | null
```

Individual parsers are also exported (`parseLinkedInAlert`, `parseIndeedAlert`,
…) for targeted use.

## Adding a new source parser

1. Add the source to the `AlertSource` union in `types.ts`.
2. Create `parsers/<source>.ts` exporting
   `parseAlert(rawText: string): RawItem[]`. Reuse `parsers/shared.ts`
   (`emailBody`, `emailDateIso`, `jobBlocks`, `looksLikeComp`, `toRawItem`).
   Document the listing shape + detection heuristic in the file header.
3. Register it in `parse.ts`: add to `PARSERS` and add a `From:`-domain entry to
   `SENDER_DOMAINS`.
4. Export it from `index.ts`.
5. Add a realistic multi-listing fixture + tests in `tests/parse.test.ts`
   (count, company/role/url populated, malformed input → no throw, detection).

## Design notes

- **`jobBlocks(body, jobUrlRe)`** splits an email into one block per listing by
  anchoring on job-link `<a href>`s that match the source's URL pattern. N job
  links → N listings; multi-listing extraction is free.
- **`htmlToLines`** turns block-level tags/`<br>` into newlines then reuses
  Engine 1's `stripHtml`, preserving the per-field line structure email
  templates encode. No new HTML dependency.
- **`fetched_at`** is derived from the email `Date:` header (keeps parsers
  pure); a current-time fallback only fires on a malformed/absent header.
- **Detection never guesses:** unknown sender → `detectSource` returns `null`
  and `parseAlertEmail` returns `[]`. An unrecognized email is skipped, not
  mis-parsed.
