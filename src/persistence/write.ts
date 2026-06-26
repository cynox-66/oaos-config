// write.ts
// File: src/persistence/write.ts
// Purpose: Write helpers. Opportunities dedupe on fingerprint (Engine 1 `merge`
//          + PATCH on hit, POST otherwise). writePipelineResult writes only
//          Opportunity + Contacts + Outreach (no Applications table exists);
//          applicationPackage / evidenceMatch details / followUpState are not
//          persisted.

import { merge } from "../engines/normalization";
import type {
  AirtableClient,
  Contact,
  OutreachDraft,
  Opportunity,
  PipelineResult,
  Score,
  WriteResult,
} from "./types";
import { TABLE_NAMES } from "./config";
import { contactFields, opportunityFields, outreachFields } from "./records";
import { createReader } from "./read";

/** A writer bound to an {@link AirtableClient}. */
export function createWriter(client: AirtableClient) {
  const reader = createReader(client);

  /**
   * Upsert an opportunity. Dedupes on fingerprint: if a record exists, folds the
   * incoming via Engine 1's `merge` and PATCHes it; otherwise creates it.
   *
   * @param opportunity the opportunity to write.
   * @param score optional score (supplies the Quality/Match/Total/Tier columns).
   */
  async function writeOpportunity(opportunity: Opportunity, score?: Score): Promise<WriteResult> {
    const existing = await reader.findOpportunityRecord(opportunity.fingerprint);
    if (existing) {
      const merged = merge(existing.opportunity, opportunity);
      return client.updateRecord(
        TABLE_NAMES.opportunities,
        existing.recordId,
        opportunityFields(merged, score)
      );
    }
    return client.createRecord(TABLE_NAMES.opportunities, opportunityFields(opportunity, score));
  }

  /** Create a contact record. `opportunity_id` is recorded in the contact Notes. */
  function writeContact(contact: Contact, opportunity_id: string): Promise<WriteResult> {
    return client.createRecord(TABLE_NAMES.contacts, contactFields(contact, opportunity_id));
  }

  /**
   * Create an outreach record. `opportunity_id` / `contact_id` are Airtable
   * record ids used for the linked Opportunity / Contact columns.
   */
  function writeOutreach(
    draft: OutreachDraft,
    opportunity_id: string,
    contact_id: string
  ): Promise<WriteResult> {
    return client.createRecord(TABLE_NAMES.outreach, outreachFields(draft, opportunity_id, contact_id));
  }

  /**
   * Persist a full pipeline result: opportunity, then every ranked contact, then
   * the outreach draft (if any). Returns every WriteResult in order.
   */
  async function writePipelineResult(result: PipelineResult): Promise<WriteResult[]> {
    const results: WriteResult[] = [];

    const oppResult = await writeOpportunity(result.opportunity, result.score);
    results.push(oppResult);
    const oppRecordId = oppResult.record_id ?? result.opportunity.id;

    const recordIdByContactId = new Map<string, string>();
    for (const contact of result.contacts.ordered) {
      const contactResult = await writeContact(contact, oppRecordId);
      results.push(contactResult);
      if (contactResult.record_id) recordIdByContactId.set(contact.id, contactResult.record_id);
    }

    if (result.outreachDraft) {
      const primaryId = result.contacts.primary_contact_id;
      const contactRecordId = primaryId ? recordIdByContactId.get(primaryId) ?? "" : "";
      results.push(
        await writeOutreach(result.outreachDraft, oppResult.record_id ?? "", contactRecordId)
      );
    }

    return results;
  }

  return { writeOpportunity, writeContact, writeOutreach, writePipelineResult };
}
