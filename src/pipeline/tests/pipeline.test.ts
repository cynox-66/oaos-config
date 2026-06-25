// tests/pipeline.test.ts
// End-to-end integration tests for the intake pipeline. A single router mock
// serves every LLM engine (scoring / evidence reason / cover letter / outreach)
// by inspecting the prompt's JSON output contract.

import { describe, it, expect } from "vitest";
import { runPipeline } from "../intake";
import type { PipelineOptions } from "../types";
import type { RawItem, Opportunity } from "../../engines/normalization/types";
import type { Evidence } from "../../engines/evidence-matching/types";
import type { GeminiClient } from "../../engines/scoring/types";
import type { DiscoveryRequest, ManualContactInput } from "../../engines/contact-ranking/types";
import type { BaseResume, OperatorProfile } from "../../engines/application-package/types";

const NOW = new Date("2026-06-24T00:00:00.000Z");

// ============================================================
// Router mock — one client for all four LLM engines
// ============================================================

function routerClient(score = { domain: 15, leverage: 15, overlap: 20 }): GeminiClient {
  return {
    async generate(prompt: string) {
      if (prompt.includes('"quality_domain"')) {
        return JSON.stringify({ ...{ quality_domain: score.domain, quality_leverage: score.leverage, match_overlap: score.overlap }, rationale: "fits" });
      }
      if (prompt.includes('"reason"')) {
        return JSON.stringify({ reason: "Proves relevant eBPF security capability." });
      }
      if (prompt.includes('"letter"')) {
        return JSON.stringify({ letter: "Isovalent works on eBPF security. I contributed KubeArmor runtime security policies. I want to contribute." });
      }
      if (prompt.includes('"has_genuine_opportunity"')) {
        return JSON.stringify({ has_genuine_opportunity: true, body: "Your KubeArmor eBPF policy path is elegant. https://github.com/kubearmor/KubeArmor" });
      }
      // outreach (email / linkedin / slack)
      return JSON.stringify({ subject: "eBPF security", body: "Your KubeArmor eBPF work stood out. https://github.com/kubearmor/KubeArmor" });
    },
  };
}

// ============================================================
// Fixtures
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

function dummyOpportunity(): Opportunity {
  return {
    id: "dummy",
    company: "Isovalent",
    role: "Engineer",
    category: "Job",
    domain: [],
    source_name: "manual",
    source_type: "job_board",
    url: null,
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

function makeRaw(
  source_type: RawItem["source_type"],
  payload: object,
  source_name = "wellfound"
): RawItem {
  return {
    source_type,
    source_name,
    url: "https://example.com/job/1",
    fetched_at: "2026-06-20T00:00:00.000Z",
    raw_payload: payload,
  };
}

const BASE_RESUME: BaseResume = {
  name: "Dev Jaiswal",
  summary: "Cloud native engineer focused on Kubernetes security and eBPF.",
  experience: [
    {
      company: "AccuKnox",
      title: "Security Engineer",
      dates: "2023-2025",
      bullets: ["Contributed KubeArmor eBPF runtime security policies"],
    },
  ],
  projects: [
    {
      name: "KubeArmor",
      description: "eBPF runtime security",
      bullets: ["Implemented eBPF policy enforcement"],
      tech_tags: ["eBPF", "Security", "Kubernetes"],
    },
  ],
  education: [{ institution: "IIT", degree: "BTech", dates: "2019-2023" }],
  skills: ["eBPF", "Security", "Kubernetes"],
};

const OPERATOR: OperatorProfile = {
  name: "Dev Jaiswal",
  github: "https://github.com/devjaiswal",
  portfolio_url: "https://devjaiswal.me",
  stack: ["eBPF", "Kubernetes"],
};

function options(over: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    inventory: INVENTORY,
    contacts_input: contactsInput([REACHABLE_CONTACT]),
    gemini_client: routerClient(),
    now: NOW,
    ...over,
  };
}

const JOB_RAW = makeRaw("job_board", {
  company: "Isovalent",
  title: "eBPF Security Engineer",
  description: "ebpf runtime security on kubernetes",
});

// ============================================================
// Tests
// ============================================================

describe("Job + contacts + evidence + resume → Both", () => {
  it("produces a recommendation of Both with both packages non-null", async () => {
    const result = await runPipeline(
      JOB_RAW,
      options({ base_resume: BASE_RESUME, operator_profile: OPERATOR, channel: "email", ask_type: "internship_inquiry" })
    );
    expect(result.opportunity.category).toBe("Job");
    expect(result.recommendation.action).toBe("Both");
    expect(result.applicationPackage).not.toBeNull();
    expect(result.outreachDraft).not.toBeNull();
    expect(result.followUpState).toBeNull();
    expect(result.evidenceMatch.ranked[0].evidence_id).toBe("kubearmor");
    expect(result.contacts.primary_contact_id).not.toBeNull();
    expect(result.timestamp).toBe(NOW);
  });
});

describe("OSS opportunity, no resume → application null, outreach non-null", () => {
  it("recommends Outreach and skips the application package", async () => {
    const ossRaw = makeRaw("oss", { company: "CNCF", title: "KubeArmor Maintainer", description: "ebpf security kubernetes" }, "lfx");
    const result = await runPipeline(
      ossRaw,
      options({ channel: "github", ask_type: "oss_contribution" }) // no base_resume / operator
    );
    expect(result.opportunity.category).toBe("OSS");
    expect(result.recommendation.action).toBe("Outreach");
    expect(result.applicationPackage).toBeNull();
    expect(result.outreachDraft).not.toBeNull();
  });
});

describe("C-tier opportunity → both packages null", () => {
  it("recommends Ignore and produces neither package even with all inputs present", async () => {
    const result = await runPipeline(
      JOB_RAW,
      options({
        gemini_client: routerClient({ domain: 0, leverage: 0, overlap: 0 }),
        inventory: [], // no evidence
        contacts_input: contactsInput([]), // no contacts
        base_resume: BASE_RESUME,
        operator_profile: OPERATOR,
        channel: "email",
        ask_type: "advice",
      })
    );
    expect(result.score.tier).toBe("C");
    expect(result.recommendation.action).toBe("Ignore");
    expect(result.applicationPackage).toBeNull();
    expect(result.outreachDraft).toBeNull();
  });
});

describe("empty contacts → no-contact rules respected", () => {
  it("yields no primary contact and no outreach draft", async () => {
    const result = await runPipeline(
      JOB_RAW,
      options({
        contacts_input: contactsInput([]),
        base_resume: BASE_RESUME,
        operator_profile: OPERATOR,
        channel: "email",
        ask_type: "advice",
      })
    );
    expect(result.contacts.ordered).toEqual([]);
    expect(result.contacts.primary_contact_id).toBeNull();
    expect(result.outreachDraft).toBeNull();
    // A Job with no reachable contact can never reach Both/Outreach.
    expect(["Apply", "Ignore"]).toContain(result.recommendation.action);
    expect(result.recommendation.action).not.toBe("Both");
    expect(result.recommendation.action).not.toBe("Outreach");
  });
});
