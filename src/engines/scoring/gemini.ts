// gemini.ts
// File: src/engines/scoring/gemini.ts
// Purpose: Thin, injectable Gemini 3.1 Flash Lite client. Production code uses
//          createGeminiClient(); tests inject a mock implementing GeminiClient.
//          This is the ONLY module that performs a network call.
//
//          Every outgoing request passes through the shared throttle in
//          src/llm — a requests-per-minute ceiling plus 429 retry with
//          backoff. See that module's header for the defect it fixes. The
//          throttle is deliberately applied HERE rather than in any engine:
//          all twelve engines route through this factory, so one wrapper
//          covers them all without a single engine change.

import type { GeminiClient } from "./types";
import { GEMINI_ENDPOINT } from "./config";
import { HttpStatusError } from "../../llm/types";
import { parseRetryAfterMs, sharedThrottle } from "../../llm/shared";
import type { Throttle } from "../../llm/types";

/** Injection points, used by this module's tests. Production uses the defaults. */
export interface GeminiClientDeps {
  fetchImpl?: typeof fetch;
  throttle?: Throttle;
}

/**
 * Create a Gemini client backed by the generateContent REST endpoint.
 *
 * @param apiKey Gemini API key; defaults to `process.env.GEMINI_API_KEY`.
 * @param deps   test seams; omit in production.
 * @throws at call time if no key is available or the request fails. The thrown
 *         error's message is unchanged from before the throttle existed, so
 *         every caller's degradation path is unaffected.
 */
export function createGeminiClient(apiKey?: string, deps: GeminiClientDeps = {}): GeminiClient {
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    async generate(prompt: string): Promise<string> {
      const key = apiKey ?? process.env.GEMINI_API_KEY;
      // Thrown before the throttle: a missing key is a configuration fault, not
      // a request, so it must not consume a rate-limit slot or a stats entry.
      if (!key) throw new Error("GEMINI_API_KEY is not set");

      const throttle = deps.throttle ?? sharedThrottle();

      return throttle(async () => {
        const res = await doFetch(`${GEMINI_ENDPOINT}?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        });

        if (!res.ok) {
          // Same message as always. HttpStatusError adds `status` so the
          // throttle can recognise a 429; it is an Error with an identical
          // message, so `catch` blocks and `String(err)` see no difference.
          throw new HttpStatusError(
            `Gemini request failed: HTTP ${res.status}`,
            res.status,
            parseRetryAfterMs(res.headers?.get?.("retry-after") ?? null)
          );
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== "string") {
          throw new Error("Gemini response contained no text");
        }
        return text;
      });
    },
  };
}
