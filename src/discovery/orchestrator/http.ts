// http.ts
// File: src/discovery/orchestrator/http.ts
// Purpose: THE ONLY PLACE IN THE CODEBASE WHERE REAL HTTP IS CONSTRUCTED for
//          Stage-3 sources. Every source module takes SourceDeps injected and
//          imports no HTTP client of its own (Wave 2 standing rule) — this
//          file is the single wiring point that makes that rule payable.
//
// Do not import `fetch` in a source module "just for one call". If a source
// needs a capability this file does not expose, extend SourceDeps in the
// frame and wire it here.

import type { HttpResponse, SourceDeps } from "../stage3/types";

/** Identifies our traffic to the boards/feeds we poll. */
export const USER_AGENT = "oaos-discovery";

/** Per-request ceiling. A hung endpoint must not hang the whole run. */
export const REQUEST_TIMEOUT_MS = 20_000;

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the real {@link SourceDeps}. `now` is a single injected clock so the
 * orchestrator can hold one instant for a whole run.
 */
export function createSourceDeps(timeoutMs: number = REQUEST_TIMEOUT_MS): SourceDeps {
  return {
    httpGet: (url, headers) =>
      request(url, { headers: { "User-Agent": USER_AGENT, ...headers } }, timeoutMs),

    httpPost: (url, body, headers) =>
      request(
        url,
        {
          method: "POST",
          headers: { "User-Agent": USER_AGENT, "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        },
        timeoutMs
      ),

    now: () => new Date().toISOString(),
  };
}
