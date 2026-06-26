// types.ts
// File: src/persistence/types.ts
// Purpose: Types for the Airtable persistence layer.

import type { Opportunity } from "../engines/normalization/types";
import type { Score } from "../engines/scoring/types";
import type { Contact } from "../engines/contact-ranking/types";
import type { OutreachDraft } from "../engines/outreach-package/types";
import type { PipelineResult } from "../pipeline/types";

export type { Opportunity, Score, Contact, OutreachDraft, PipelineResult };

/** A raw Airtable record. */
export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

/** Parsed response of a list (read) call. */
export interface ReadResult {
  records: AirtableRecord[];
}

/** Outcome of a single write (create/update) call. */
export interface WriteResult {
  success: boolean;
  table: string;
  operation: "create" | "update" | "skip";
  /** The Airtable record id (recXXX) on success. */
  record_id?: string;
  /** The Airtable error message on failure (e.g. a 422 field mismatch). */
  error?: string;
}

/**
 * Thin Airtable HTTP client. Injectable: tests build one over a mock `fetch`.
 * `createRecord` / `updateRecord` never throw on a 4xx — they return a failure
 * WriteResult. A network error (rejected fetch) DOES throw. `listRecords` throws
 * on any non-ok response after retries.
 */
export interface AirtableClient {
  createRecord(table: string, fields: Record<string, unknown>): Promise<WriteResult>;
  updateRecord(table: string, recordId: string, fields: Record<string, unknown>): Promise<WriteResult>;
  listRecords(table: string, params?: { filterByFormula?: string; maxRecords?: number }): Promise<ReadResult>;
}
