// followup.ts
// File: src/engines/follow-up/followup.ts
// Purpose: Orchestrator for the Follow-Up Engine (Engine 8): run the pure state
//          machine; if terminal, return immediately (no draft, no Gemini call);
//          otherwise generate the per-step follow-up draft with one regeneration
//          (≤2 Gemini calls) and a LinkedIn→email channel-switch note for FU2.

import { createGeminiClient } from "../scoring/gemini";
import { wordCount } from "../outreach-package/constraints";
import type { OutreachDraft } from "../outreach-package/types";
import type { FollowUpOptions, FollowUpRequest, FollowUpState, GeminiClient } from "./types";
import { computeNextStep } from "./state-machine";
import {
  buildFollowUpPrompt,
  buildRegenPrompt,
  checkFollowUpConstraints,
  parseFollowUpResponse,
} from "./prompts";

/** Customization notes (always populated); adds a channel-switch note for FU2. */
function buildNotes(request: FollowUpRequest, fu: number): string {
  const parts = [
    `Verify ${request.contact.name} is still at ${request.contact.company}, and confirm no reply has arrived (a reply cancels this follow-up).`,
  ];
  const isLinkedin = request.channel === "linkedin_connect" || request.channel === "linkedin_dm";
  if (fu === 2 && isLinkedin && request.contact.channels.email) {
    parts.push(
      `LinkedIn drew no reply — consider switching to email (${request.contact.channels.email}) for this follow-up.`
    );
  }
  return parts.join(" ");
}

/** Assemble an OutreachDraft for follow-up `fu` from a parsed body. */
function assembleDraft(request: FollowUpRequest, fu: number, body: string): OutreachDraft {
  const cr = checkFollowUpConstraints(body, fu);
  return {
    channel: request.channel,
    subject: null, // follow-ups thread the original
    body,
    word_count: wordCount(body),
    char_count: body.length,
    evidence_referenced: request.new_evidence?.id ?? null,
    constraint_pass: cr.pass,
    constraint_violations: cr.violations,
    customization_notes: buildNotes(request, fu),
  };
}

/**
 * Compute the follow-up state and, when a follow-up is due, generate its draft.
 * Terminal states return immediately with `draft=null` and make no Gemini call.
 *
 * @param request the outreach record + last-sent `step`.
 * @param options.client injected Gemini client (defaults to a real one).
 * @param options.now reference clock (does not gate behavior).
 */
export async function buildFollowUp(
  request: FollowUpRequest,
  options: FollowUpOptions = {}
): Promise<FollowUpState> {
  const now = options.now ?? new Date();
  const state = computeNextStep(request, now);

  // Terminal → no draft, no Gemini call.
  if (state.terminal) return state;

  const fu = state.step; // the follow-up number being prepared (1..3)
  const client: GeminiClient = options.client ?? createGeminiClient();

  let body = parseFollowUpResponse(await client.generate(buildFollowUpPrompt(request, fu)));
  let draft = assembleDraft(request, fu, body);

  // One regeneration on any constraint failure.
  if (!draft.constraint_pass) {
    body = parseFollowUpResponse(
      await client.generate(buildRegenPrompt(request, fu, draft.constraint_violations))
    );
    draft = assembleDraft(request, fu, body);
  }

  return { ...state, draft };
}
