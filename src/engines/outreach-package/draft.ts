// draft.ts
// File: src/engines/outreach-package/draft.ts
// Purpose: Orchestrator for the Outreach Package Engine (Engine 7): resolve the
//          single proof evidence, generate the channel draft (with one
//          regeneration), run the draft-intrinsic constraints + the
//          single-evidence URL check, and assemble the OutreachDraft. The
//          github "no genuine opportunity" path short-circuits without
//          consuming the regeneration budget.

import { createGeminiClient } from "../scoring/gemini";
import type {
  Evidence,
  GeminiClient,
  OutreachDraft,
  OutreachOptions,
  OutreachRequest,
  ProofPoint,
} from "./types";
import { CHANNEL_LIMITS } from "./config";
import { checkConstraints, wordCount } from "./constraints";
import { buildPrompt, buildRegenPrompt, parseDraftResponse } from "./prompts";
import type { ParsedDraft } from "./prompts/shared";

// ============================================================
// Customization notes (always populated)
// ============================================================

function verifyNote(request: OutreachRequest, sparse: boolean): string {
  const parts = [
    `Verify ${request.contact.name} is still at ${request.contact.company} and that all facts are accurate before sending.`,
  ];
  if (request.contact.last_verified === null) {
    parts.push("Employment is unverified — confirm the current role.");
  }
  if (sparse) {
    parts.push("No matched evidence — references capability generally; proof is thin.");
  }
  return parts.join(" ");
}

// ============================================================
// Single-evidence URL check (orchestrator-level; needs inventory)
// ============================================================

function occurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  return haystack.split(needle).length - 1;
}

/**
 * Verify exactly one evidence asset is referenced (GAP A). Non-sparse: the
 * ranked[0] URL appears exactly once and no other inventory URL appears. Sparse:
 * no inventory URL appears at all.
 */
function checkEvidenceReference(
  body: string,
  evidence: Evidence | null,
  inventory: Evidence[],
  sparse: boolean
): string[] {
  const violations: string[] = [];
  const inventoryUrls = inventory.map((e) => e.url).filter((u) => u.length > 0);

  if (sparse) {
    if (inventoryUrls.some((u) => body.includes(u))) {
      violations.push("evidence: sparse mode but body references an inventory asset");
    }
    return violations;
  }

  const targetUrl = evidence!.url;
  const targetCount = occurrences(body, targetUrl);
  if (targetCount !== 1) {
    violations.push(`evidence: ranked[0] URL must appear exactly once (found ${targetCount})`);
  }
  const otherReferenced = inventoryUrls.filter((u) => u !== targetUrl && body.includes(u));
  if (otherReferenced.length > 0) {
    violations.push("evidence: body references another inventory asset");
  }
  return violations;
}

// ============================================================
// Assembly
// ============================================================

function assemble(
  request: OutreachRequest,
  evidence: Evidence | null,
  sparse: boolean,
  parsed: ParsedDraft
): OutreachDraft {
  const limit = CHANNEL_LIMITS[request.channel];
  const subject = limit.hasSubject ? parsed.subject : null;
  const body = parsed.body;

  const draft: OutreachDraft = {
    channel: request.channel,
    subject,
    body,
    word_count: wordCount(body),
    char_count: body.length,
    evidence_referenced: evidence ? evidence.id : null,
    constraint_pass: false,
    constraint_violations: [],
    customization_notes: verifyNote(request, sparse),
  };

  const intrinsic = checkConstraints(draft, request.channel);
  const evidenceViolations = checkEvidenceReference(body, evidence, request.inventory, sparse);
  const violations = [...intrinsic.violations, ...evidenceViolations];

  draft.constraint_violations = violations;
  draft.constraint_pass = violations.length === 0;
  return draft;
}

/** The deliberate "no genuine GitHub opportunity" draft (GAP B). */
function githubNoOpportunityDraft(request: OutreachRequest): OutreachDraft {
  return {
    channel: "github",
    subject: null,
    body: "",
    word_count: 0,
    char_count: 0,
    evidence_referenced: null,
    constraint_pass: false,
    constraint_violations: ["github: no genuine technical opportunity"],
    customization_notes: `No genuine technical opportunity on GitHub for ${request.contact.name} — use a different channel (e.g. email or LinkedIn).`,
  };
}

// ============================================================
// Public entry point
// ============================================================

/**
 * Generate a channel-correct outreach draft. The draft references exactly one
 * evidence asset (ranked[0], or none in the sparse path) and is constraint-
 * checked; on a constraint failure it regenerates once (≤2 Gemini calls). The
 * github "no genuine opportunity" signal returns immediately.
 *
 * @param request contact + opportunity + match + inventory + ask_type + channel.
 * @param options.client injected Gemini client (defaults to a real one).
 */
export async function buildOutreachDraft(
  request: OutreachRequest,
  options: OutreachOptions = {}
): Promise<OutreachDraft> {
  const client: GeminiClient = options.client ?? createGeminiClient();

  const ranked0 = request.match.ranked[0];
  const evidence = ranked0
    ? request.inventory.find((e) => e.id === ranked0.evidence_id) ?? null
    : null;
  const sparse = evidence === null;
  const proof: ProofPoint | null = evidence ? { evidence, reason: ranked0!.reason } : null;

  // Attempt 1.
  let parsed = parseDraftResponse(await client.generate(buildPrompt(request, proof)));
  if (request.channel === "github" && parsed.has_genuine_opportunity === false) {
    return githubNoOpportunityDraft(request);
  }

  let draft = assemble(request, evidence, sparse, parsed);

  // One regeneration on any constraint failure.
  if (!draft.constraint_pass) {
    parsed = parseDraftResponse(
      await client.generate(buildRegenPrompt(request, proof, draft.constraint_violations))
    );
    if (request.channel === "github" && parsed.has_genuine_opportunity === false) {
      return githubNoOpportunityDraft(request);
    }
    draft = assemble(request, evidence, sparse, parsed);
  }

  return draft;
}
