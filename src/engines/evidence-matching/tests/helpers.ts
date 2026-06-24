// tests/helpers.ts
// Shared builders and mock Gemini clients for the evidence-matching tests.

import { join } from "path";
import type { Opportunity } from "../../normalization/types";
import type { GeminiClient } from "../../scoring";
import type { Evidence } from "../types";
import { loadInventory } from "../inventory";

/** Fixed reference clock so recency (and thus fit/ranking) is deterministic. */
export const NOW = new Date("2026-06-24T00:00:00.000Z");

/** The real C4 inventory, parsed from evidence/inventory.md. */
export const INVENTORY: Evidence[] = loadInventory(join(process.cwd(), "evidence/inventory.md"));

/** A fully-populated Opportunity with defaults; override per test. */
export function makeOpportunity(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp_test",
    company: "Acme",
    role: "Engineer",
    category: "Job",
    domain: [],
    source_name: "manual",
    source_type: "job_board",
    url: "https://acme.com/jobs/1",
    description_raw: "",
    description_norm: "",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp_test",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
    ...over,
  };
}

/**
 * Mock client that echoes the asset's blurb back as the reason (extracted from
 * the prompt). Guarantees a grounded, non-fabricated reason for happy-path tests.
 */
export function echoBlurbClient(): GeminiClient {
  return {
    async generate(prompt: string) {
      const m = prompt.match(/Asset proves: (.+)/) ?? prompt.match(/"([^"]+)"/);
      return JSON.stringify({ reason: m ? m[1] : "relevant capability" });
    },
  };
}

/** Client returning a fixed JSON reason. */
export function fixedReasonClient(reason: string): GeminiClient {
  return {
    async generate() {
      return JSON.stringify({ reason });
    },
  };
}

/** Client whose response is chosen per call number; tracks call count. */
export function countingClient(responder: (call: number) => string): {
  client: GeminiClient;
  state: { calls: number };
} {
  const state = { calls: 0 };
  const client: GeminiClient = {
    async generate() {
      state.calls += 1;
      return responder(state.calls);
    },
  };
  return { client, state };
}

/** Client that always throws (simulates Gemini transport failure). */
export function throwingClient(): GeminiClient {
  return {
    async generate() {
      throw new Error("simulated gemini failure");
    },
  };
}
