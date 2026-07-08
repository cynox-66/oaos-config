// gemini.ts
// File: src/engines/scoring/gemini.ts
// Purpose: Thin, injectable Gemini 3.1 Flash Lite client. Production code uses
//          createGeminiClient(); tests inject a mock implementing GeminiClient.
//          This is the ONLY module that performs a network call.

import type { GeminiClient } from "./types";
import { GEMINI_ENDPOINT } from "./config";

/**
 * Create a Gemini client backed by the generateContent REST endpoint.
 *
 * @param apiKey Gemini API key; defaults to `process.env.GEMINI_API_KEY`.
 * @throws at call time if no key is available or the request fails.
 */
export function createGeminiClient(apiKey?: string): GeminiClient {
  return {
    async generate(prompt: string): Promise<string> {
      const key = apiKey ?? process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");

      const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini request failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new Error("Gemini response contained no text");
      }
      return text;
    },
  };
}
