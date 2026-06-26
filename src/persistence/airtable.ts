// airtable.ts
// File: src/persistence/airtable.ts
// Purpose: Thin Airtable REST v0 client — raw fetch, no SDK. Injectable via a
//          factory that accepts apiKey/baseId/fetch so tests mock the HTTP layer.
//          Handles 429 (exponential backoff, max 3 retries), 4xx (failure
//          WriteResult), and network errors (throw).

import type { AirtableClient, ReadResult, WriteResult } from "./types";
import { AIRTABLE_API_ROOT, DEFAULT_RETRY_DELAY_MS, MAX_RETRIES } from "./config";

export interface AirtableClientOptions {
  /** API key; defaults to `process.env.AIRTABLE_API_KEY`. */
  apiKey?: string;
  /** Base id; defaults to `process.env.AIRTABLE_BASE_ID`. */
  baseId?: string;
  /** Injected fetch (for tests); defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Base retry delay (ms); tests pass 0. */
  retryDelayMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Extract a human-readable error message from an Airtable error response. */
async function extractError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } | string };
    if (typeof data.error === "string") return data.error;
    if (data.error?.message) return data.error.message;
  } catch {
    // fall through
  }
  return `HTTP ${res.status}`;
}

/**
 * Create an Airtable client. Reads `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` from
 * the environment unless provided. Throws a clear error if either is missing.
 *
 * @throws if no API key or base id is available.
 */
export function createAirtableClient(options: AirtableClientOptions = {}): AirtableClient {
  const apiKey = options.apiKey ?? process.env.AIRTABLE_API_KEY;
  if (!apiKey) throw new Error("Missing AIRTABLE_API_KEY — add to .env");
  const baseId = options.baseId ?? process.env.AIRTABLE_BASE_ID;
  if (!baseId) throw new Error("Missing AIRTABLE_BASE_ID — add to .env");

  const doFetch = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const baseUrl = `${AIRTABLE_API_ROOT}/${baseId}`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  /** Fetch with 429 exponential backoff (a rejected fetch — network error — throws). */
  async function request(path: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await doFetch(`${baseUrl}/${path}`, { ...init, headers });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      return res;
    }
  }

  async function write(
    table: string,
    operation: "create" | "update",
    path: string,
    method: "POST" | "PATCH",
    fields: Record<string, unknown>
  ): Promise<WriteResult> {
    // A network error rejects here and propagates (we do not swallow it).
    const res = await request(path, { method, body: JSON.stringify({ fields, typecast: true }) });
    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return { success: true, table, operation, record_id: data.id };
    }
    return { success: false, table, operation, error: await extractError(res) };
  }

  return {
    createRecord(table, fields) {
      return write(table, "create", encodeURIComponent(table), "POST", fields);
    },
    updateRecord(table, recordId, fields) {
      return write(table, "update", `${encodeURIComponent(table)}/${recordId}`, "PATCH", fields);
    },
    async listRecords(table, params = {}): Promise<ReadResult> {
      const qs = new URLSearchParams();
      if (params.filterByFormula) qs.set("filterByFormula", params.filterByFormula);
      if (params.maxRecords) qs.set("maxRecords", String(params.maxRecords));
      const query = qs.toString();
      const path = query ? `${encodeURIComponent(table)}?${query}` : encodeURIComponent(table);
      const res = await request(path, { method: "GET" });
      if (!res.ok) {
        throw new Error(`Airtable list failed: HTTP ${res.status} — ${await extractError(res)}`);
      }
      const data = (await res.json()) as ReadResult;
      return { records: data.records ?? [] };
    },
  };
}
