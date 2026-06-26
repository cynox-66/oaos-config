// index.ts
// File: src/persistence/index.ts
// Purpose: Public surface of the Airtable persistence layer.

import { createAirtableClient } from "./airtable";
import { createReader } from "./read";
import { createWriter } from "./write";
import type { AirtableClient } from "./types";

/**
 * Create the persistence API (reader + writer) over an Airtable client. Pass a
 * client (e.g. one built with a mock `fetch`) for tests; omit it to use a client
 * built from `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` in the environment.
 */
export function createPersistence(client?: AirtableClient) {
  const c = client ?? createAirtableClient();
  return { ...createReader(c), ...createWriter(c) };
}

export { createAirtableClient } from "./airtable";
export { createReader } from "./read";
export { createWriter } from "./write";
export {
  opportunityFields,
  contactFields,
  outreachFields,
  parseOpportunity,
} from "./records";
export { FIELD_NAMES, TABLE_NAMES } from "./config";

export type {
  AirtableRecord,
  AirtableClient,
  WriteResult,
  ReadResult,
} from "./types";
export type { AirtableClientOptions } from "./airtable";
