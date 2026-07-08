// tests/research.test.ts
// Unit tests for the research enrichment step (researchOpportunity) plus
// integration tests proving the pipeline threads research.stage /
// research.oss_involvement into Engine 2, and degrades gracefully to
// research=null on Gemini failure (no regression vs. the old null stub).

import { describe, it, expect } from "vitest";
import { researchOpportunity, buildResearchPrompt } from "../research";
import { runPipeline } from "../intake";
import type { PipelineOptions } from "../types";
import type { RawItem, Opportunity } from "../../engines/normalization/types";
import type { Evidence } from "../../engines/evidence-matching/types";
import type { GeminiClient } from "../../engines/scoring/types";
import type { DiscoveryRequest, ManualContactInput } from "../../engines/contact-ranking/types";

const NOW = new Date("2026-06-24T00:00:00.000Z");

// A complete, valid research payload matching prompts/company-research.md.
const VALID_RESEARCH = {
  company: "Isovalent",
  description: "eBPF-based networking and security.",
  tech_stack: ["eBPF", "Go", "Kubernetes"],
  primary_language: "Go",
  oss_involvement: "maintains",
  oss_projects: ["Cilium"],
  kubernetes_usage: "core-product",
  ebpf_usage: "core",
  security_focus: "core",
  hiring_signals: ["open roles on LinkedIn"],
  careers_url: "https://isovalent.com/careers",
  key_engineers: [{ name: "Ada", title: "Eng", github: "ada", linkedin: "ada" }],
  stage: "seed",
  employee_count_estimate: "50-100",
  yc_backed: false,
  cncf_member: true,
  suggested_quality_score: 45,
  scoring_rationale: "Core eBPF/K8s, maintains Cilium.",
};

function dummyOpportunity(): Opportunity {
  return {
    id: "dummy",
    company: "Isovalent",
    role: "Engineer",
    category: "Job",
    domain: [],
    source_name: "manual",
    source_type: "job_board",
    url: "https://isovalent.com",
    description_raw: "",
    description_norm: "",
    comp_min: null,
    comp_max: null,
    comp_basis: "monthly",
    remote: "remote",
    location: null,
    date_found: "2026-06-20",
    fingerprint: "fp",
    status: "Discovered",
    completeness: 1,
    needs_enrichment: false,
    also_seen_in: [],
  };
}

// ============================================================
// Unit tests — researchOpportunity
// ============================================================

describe("researchOpportunity", () => {
  it("parses a valid research JSON response into a ResearchResult", async () => {
    const client: GeminiClient = { async generate() { return JSON.stringify(VALID_RESEARCH); } };
    const res = await researchOpportunity(dummyOpportunity(), client);
    expect(res).not.toBeNull();
    expect(res?.stage).toBe("seed");
    expect(res?.oss_involvement).toBe("maintains");
    expect(res?.tech_stack).toContain("eBPF");
  });

  it("tolerates markdown code fences around the JSON", async () => {
    const client: GeminiClient = {
      async generate() { return "```json\n" + JSON.stringify(VALID_RESEARCH) + "\n```"; },
    };
    const res = await researchOpportunity(dummyOpportunity(), client);
    expect(res?.stage).toBe("seed");
  });

  it("returns null when the client throws (transport failure)", async () => {
    const client: GeminiClient = { async generate() { throw new Error("HTTP 500"); } };
    expect(await researchOpportunity(dummyOpportunity(), client)).toBeNull();
  });

  it("returns null on a non-JSON response", async () => {
    const client: GeminiClient = { async generate() { return "sorry, I cannot help with that"; } };
    expect(await researchOpportunity(dummyOpportunity(), client)).toBeNull();
  });

  it("returns null when the response parses to a non-object (e.g. a bare array)", async () => {
    const client: GeminiClient = { async generate() { return "[1, 2, 3]"; } };
    expect(await researchOpportunity(dummyOpportunity(), client)).toBeNull();
  });

  it("substitutes company and url into the prompt", () => {
    const prompt = buildResearchPrompt(dummyOpportunity());
    expect(prompt).toContain("Isovalent");
    expect(prompt).toContain("https://isovalent.com");
  });

  it("uses an (unknown) placeholder when the opportunity url is null", () => {
    const opp = { ...dummyOpportunity(), url: null };
    expect(buildResearchPrompt(opp)).toContain("(unknown)");
  });
});

// ============================================================
// Integration — research threads into Engine 2 via runPipeline
// ============================================================

const INVENTORY: Evidence[] = [
  {
    id: "kubearmor",
    title: "KubeArmor contributions",
    type: "PR",
    url: "https://github.com/kubearmor/KubeArmor",
    tech_tags: ["eBPF", "Security", "Kubernetes"],
    domains: ["eBPF", "Security", "Kubernetes"],
    relevance_blurb: "KubeArmor contributions proving eBPF runtime security capability.",
    recency_date: "2025-04-10",
    strength: 5,
  },
];

const REACHABLE_CONTACT: ManualContactInput = {
  name: "Ada Lin",
  company: "Isovalent",
  title: "Security Engineer",
  email: "ada@isovalent.com",
  twitter: "https://twitter.com/ada",
  followers: 200,
  relationship: "GitHub Interaction",
};

function contactsInput(manual: ManualContactInput[]): DiscoveryRequest {
  return { opportunity: dummyOpportunity(), manual };
}

// Router mock that serves every LLM engine AND the research step. `research`
// selects the research-step behavior: "ok" (valid JSON) or "fail" (throw).
function routerClient(research: "ok" | "fail"): GeminiClient {
  return {
    async generate(prompt: string) {
      // Research step: uniquely identified by the suggested_quality_score field.
      if (prompt.includes('"suggested_quality_score"')) {
        if (research === "fail") throw new Error("Gemini down");
        return JSON.stringify(VALID_RESEARCH);
      }
      if (prompt.includes('"quality_domain"')) {
        return JSON.stringify({ quality_domain: 15, quality_leverage: 15, match_overlap: 20, rationale: "fits" });
      }
      if (prompt.includes('"reason"')) {
        return JSON.stringify({ reason: "Proves relevant eBPF security capability." });
      }
      if (prompt.includes('"letter"')) {
        return JSON.stringify({ letter: "Isovalent works on eBPF security. I contributed KubeArmor. I want to contribute." });
      }
      if (prompt.includes('"has_genuine_opportunity"')) {
        return JSON.stringify({ has_genuine_opportunity: true, body: "Your KubeArmor eBPF policy path is elegant. https://github.com/kubearmor/KubeArmor" });
      }
      return JSON.stringify({ subject: "eBPF security", body: "Your KubeArmor eBPF work stood out. https://github.com/kubearmor/KubeArmor" });
    },
  };
}

function makeRaw(): RawItem {
  return {
    source_type: "job_board",
    source_name: "wellfound",
    url: "https://isovalent.com/job/1",
    fetched_at: "2026-06-20T00:00:00.000Z",
    raw_payload: { company: "Isovalent", title: "eBPF Security Engineer", description: "ebpf runtime security on kubernetes" },
  };
}

function options(research: "ok" | "fail"): PipelineOptions {
  return {
    inventory: INVENTORY,
    contacts_input: contactsInput([REACHABLE_CONTACT]),
    gemini_client: routerClient(research),
    now: NOW,
  };
}

describe("pipeline research enrichment integration", () => {
  it("valid research JSON → score reflects research.stage and research.oss_involvement", async () => {
    const result = await runPipeline(makeRaw(), options("ok"));
    // seed → 10 (STAGE_SCORES), maintains → 10 (OSS_INVOLVEMENT_SCORES).
    expect(result.score.quality.stage).toBe(10);
    expect(result.score.quality.oss).toBe(10);
  });

  it("Gemini research failure → research=null path: defaults + degraded confidence, no crash", async () => {
    const ok = await runPipeline(makeRaw(), options("ok"));
    const failed = await runPipeline(makeRaw(), options("fail"));

    // Null-fallback factor values (STAGE_DEFAULT 3, OSS_DEFAULT 0).
    expect(failed.score.quality.stage).toBe(3);
    expect(failed.score.quality.oss).toBe(0);

    // Confidence degrades by the 0.3 research weight vs. the enriched run.
    expect(failed.score.confidence).toBeLessThan(ok.score.confidence);
    expect(ok.score.confidence - failed.score.confidence).toBeCloseTo(0.3, 5);

    // Pipeline still completes end-to-end.
    expect(failed.recommendation).toBeDefined();
    expect(failed.timestamp).toBe(NOW);
  });
});
