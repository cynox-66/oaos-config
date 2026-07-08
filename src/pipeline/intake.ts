// intake.ts
// File: src/pipeline/intake.ts
// Purpose: The OAOS intake pipeline. Wires Engines 1→7 into a single
//          RawItem → PipelineResult run. Introduces no new behavior: every step
//          is an existing engine call; the pipeline only sequences them, threads
//          a single clock + Gemini client, and gates the optional steps.

import { normalize } from "../engines/normalization";
import { rankContacts } from "../engines/contact-ranking";
import { match } from "../engines/evidence-matching";
import { computeScore } from "../engines/scoring";
import { recommend } from "../engines/recommended-action";
import { buildApplicationPackage } from "../engines/application-package";
import { buildOutreachDraft } from "../engines/outreach-package";
import { researchOpportunity } from "./research";
import type {
  ApplicationPackage,
  OutreachDraft,
  PipelineOptions,
  PipelineResult,
  RawItem,
} from "./types";

/**
 * Run the intake pipeline for a single raw item.
 *
 * Order: normalize → rankContacts → match → computeScore → recommend, then the
 * gated preparation steps:
 *  - application package when `action ∈ {Apply, Both}` AND both `base_resume`
 *    and `operator_profile` are provided;
 *  - outreach draft when `action ∈ {Outreach, Both}` AND a primary contact
 *    exists AND both `channel` and `ask_type` are provided.
 *
 * `research` is enriched via {@link researchOpportunity} (null on Gemini
 * failure or when no client is provided). `followUpState` is always null
 * at intake (Engine 8 runs only after a send). One `now` instant is held for the
 * whole run so every engine sees the same moment.
 *
 * @param raw the source item to process.
 * @param options inventory, contact sources, and the optional gating inputs.
 */
export async function runPipeline(
  raw: RawItem,
  options: PipelineOptions
): Promise<PipelineResult> {
  const now = options.now ?? new Date();
  const client = options.gemini_client;

  // 1. Normalize → canonical opportunity (authoritative).
  const opportunity = normalize(raw);

  // 2. Research enrichment. Returns null on any Gemini failure (graceful
  //    degradation — Engine 2 handles null research via its degraded path).
  const research = client ? await researchOpportunity(opportunity, client) : null;

  // 3. Contact discovery + ranking (override the caller's opportunity).
  const contacts = rankContacts(
    { ...options.contacts_input, opportunity },
    { now }
  );

  // 4. Evidence matching.
  const evidenceMatch = await match({ opportunity, inventory: options.inventory }, { client, now });

  // 5. Scoring (Engine 2's `now` is an ISO string).
  const score = await computeScore(
    {
      opportunity,
      research,
      contacts: contacts.ordered,
      evidence_match: evidenceMatch,
    },
    { client, now: now.toISOString() }
  );

  // 6. Recommended action.
  const recommendation = recommend(
    {
      opportunity,
      score,
      contacts: contacts.ordered,
      evidence_match: evidenceMatch,
    },
    { pipeline_thin: options.pipeline_thin ?? false }
  );

  const action = recommendation.action;

  // 7. Application package (Apply/Both + base_resume + operator_profile).
  let applicationPackage: ApplicationPackage | null = null;
  if (
    (action === "Apply" || action === "Both") &&
    options.base_resume &&
    options.operator_profile
  ) {
    const role_description = opportunity.description_norm || opportunity.role;
    applicationPackage = await buildApplicationPackage(
      {
        opportunity,
        match: evidenceMatch,
        inventory: options.inventory,
        base_resume: options.base_resume,
        operator: options.operator_profile,
        role_description,
      },
      { client }
    );
  }

  // 8. Outreach draft (Outreach/Both + primary contact + channel + ask_type).
  let outreachDraft: OutreachDraft | null = null;
  if (
    (action === "Outreach" || action === "Both") &&
    contacts.primary_contact_id !== null &&
    options.channel &&
    options.ask_type
  ) {
    const primary = contacts.ordered.find((c) => c.id === contacts.primary_contact_id);
    if (primary) {
      outreachDraft = await buildOutreachDraft(
        {
          contact: primary,
          opportunity,
          match: evidenceMatch,
          inventory: options.inventory,
          ask_type: options.ask_type,
          channel: options.channel,
        },
        { client }
      );
    }
  }

  // 9. Follow-up state is null at intake (created only after a send).
  return {
    opportunity,
    score,
    evidenceMatch,
    recommendation,
    contacts,
    applicationPackage,
    outreachDraft,
    followUpState: null,
    timestamp: now,
  };
}
