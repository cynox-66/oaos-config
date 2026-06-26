# Changelog — Airtable Persistence Layer

## [Initial] — 2026-06-24

Implemented the Airtable persistence layer, with gaps resolved by operator
direction (field names live in a config object as the contract; `AIRTABLE_API_KEY`
/ `AIRTABLE_BASE_ID` env vars; `applicationPackage` not persisted; multi-value
fields as native arrays / newline-joined text; only score totals + tier on
Opportunities). No engine or pipeline modified.

### Added
- `config.ts` — `TABLE_NAMES` + `FIELD_NAMES` (the single source of truth for the
  base schema) and HTTP tuning (retry budget, backoff delay).
- `airtable.ts` — `createAirtableClient` (injectable: apiKey/baseId/fetch),
  raw REST v0 calls, 429 exponential backoff (max 3 retries), 4xx → failure
  WriteResult, network error → throw. Throws a clear error on missing env vars.
- `records.ts` — pure mappers `opportunityFields` (with optional score totals),
  `contactFields`, `outreachFields`, and `parseOpportunity`. Columns without a
  home are folded into per-table `Notes`; `Domain` stays an array.
- `read.ts` — `createReader`: `findByFingerprint` (filterByFormula on
  `Fingerprint`) and `findContactsByOpportunity` (matches the opportunity ref in
  `Notes`, since Contacts has no link column).
- `write.ts` — `createWriter`: `writeOpportunity` (dedupe via Engine 1 `merge` →
  PATCH, else POST), `writeContact`, `writeOutreach`, and `writePipelineResult`
  (Opportunity → Contacts → Outreach, returning all WriteResults). Outreach links
  to the Opportunity + primary Contact record ids.
- `index.ts` — `createPersistence(client?)` (reader + writer) + re-exports.
- `.env.example` — populated with all six env vars including the two Airtable ones.
- Vitest suite (7 tests) over a mocked `fetch`: write fields/table/auth, dedupe
  PATCH-vs-POST, 429 retry budget, 422 error surface, filterByFormula encoding,
  the writePipelineResult sequence, and the missing-env-var error.
- README + TSDoc.

### Tooling
- No new dependencies (raw `fetch`, no Airtable SDK). No `tsconfig` added.
