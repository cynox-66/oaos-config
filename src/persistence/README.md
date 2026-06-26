# Airtable Persistence Layer

Persists a `PipelineResult` to the Airtable base over the **REST API v0** — raw
`fetch`, **no SDK, no new dependencies**. The HTTP client is injectable (tests
mock `fetch`; nothing real is touched).

## Setup

Requires two env vars (placeholders are in `.env.example`):

```
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=...
```

The client reads them from `process.env` and throws a clear error if either is
missing (`"Missing AIRTABLE_API_KEY — add to .env"`).

## Field-name config is the contract

The repo has no record of the live base schema, so **all table + field names live
in `config.ts`** (`TABLE_NAMES`, `FIELD_NAMES`). They must match the base as
built. If a name is wrong, Airtable returns a `422` naming the bad field — fix it
in `config.ts`, never in logic.

## Usage

```ts
import { createPersistence, createAirtableClient } from "./index";

// Production: client from env.
const db = createPersistence();

// Tests: inject a client over a mock fetch.
const db = createPersistence(createAirtableClient({ apiKey, baseId, fetchImpl }));

await db.writeOpportunity(opportunity, score);          // dedupe → PATCH or POST
await db.writeContact(contact, opportunityRecordId);
await db.writeOutreach(draft, opportunityRecordId, contactRecordId);
const results = await db.writePipelineResult(result);   // all three, in sequence

const existing = await db.findByFingerprint(fingerprint);
const contacts = await db.findContactsByOpportunity(opportunityRef);
```

## What is written (and what is not)

`writePipelineResult` writes, in order:

1. **Opportunities** — opportunity fields + the score summary (`Quality Score`,
   `Match Score`, `Total Score`, `Tier`; **no sub-factors**). Columns without a
   home (description, comp, remote, completeness, `also_seen_in`, …) are folded
   into the `Notes` field.
2. **Contacts** — one per ranked contact. Fields without a column (seniority,
   role_relevance, primary, identity_uncertain, slack, the opportunity ref) go
   into `Notes` (the configured Contacts table has no opportunity link column).
3. **Outreach** — only if `outreachDraft` is non-null; links to the Opportunity
   and primary Contact record ids.

**Not persisted** (no table / no column in the base): `applicationPackage`,
`evidenceMatch` details, score sub-factors, `recommendation`, `followUpState`.

## Dedupe

Before writing an opportunity, `findByFingerprint` queries Opportunities by
`Fingerprint`. On a hit, Engine 1's `merge` folds the incoming record and the
existing row is **PATCH**ed (updated); otherwise a new row is **POST**ed.

## Multi-value fields

- `Domain` → array (Airtable multi-select).
- `also_seen_in` / `constraint_violations` → newline-joined text (folded into `Notes`).

## Error handling

- **429** → exponential backoff, up to 3 retries, then a failure `WriteResult`.
- **422** (and other 4xx) → `WriteResult { success: false, error }` with the
  Airtable message (e.g. the mismatched field name).
- **Network error** (rejected fetch) → thrown, never swallowed.

## Running tests

```bash
npm test
```

The HTTP layer is mocked (intercepted `fetch`). Tests cover: correct
table/fields/auth on write, dedupe PATCH-vs-POST, the 429 retry budget, the 422
error surface, `filterByFormula` encoding, the `writePipelineResult` sequence,
and the missing-env-var error.
