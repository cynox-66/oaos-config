// read.ts
// File: src/persistence/read.ts
// Purpose: Read helpers for dedupe + contact lookup. Best-effort parsing back
//          into engine types (lossy for columns the base does not store).

import type { AirtableClient, AirtableRecord, Contact, Opportunity } from "./types";
import type { ContactRelationship, ManualContactInput } from "../engines/contact-ranking/types";
import { FIELD_NAMES, TABLE_NAMES } from "./config";
import { parseOpportunity } from "./records";

const FO = FIELD_NAMES.opportunities;
const FC = FIELD_NAMES.contacts;

/** Quote a value for an Airtable formula string literal (values are quote-free). */
function quote(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function parseContact(record: AirtableRecord): Contact {
  const f = record.fields;
  const str = (k: string): string | null => (typeof f[k] === "string" ? (f[k] as string) : null);
  return {
    id: record.id,
    name: str(FC.name) ?? "",
    company: "",
    title: str(FC.title) ?? "",
    seniority: "Mid",
    channels: {
      github: str(FC.github_url),
      email: str(FC.email),
      linkedin: str(FC.linkedin_url),
      slack: null,
    },
    reachability: typeof f[FC.reachability] === "number" ? (f[FC.reachability] as number) : 0,
    role_relevance: 0,
    oss_overlap: str(FC.oss_overlap) ?? "",
    last_verified: null,
    primary: false,
    relationship: (str(FC.relationship) ?? "Cold") as ContactRelationship,
    identity_uncertain: false,
  };
}

/** The value of a `Key: value` line inside a Notes blob, or null. */
function noteLine(notes: string, key: string): string | null {
  const m = notes.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, "im"));
  return m ? m[1].trim() : null;
}

/** A reader bound to an {@link AirtableClient}. */
export function createReader(client: AirtableClient) {
  /** Internal: the matching Opportunities record + parsed opportunity, or null. */
  async function findOpportunityRecord(
    fingerprint: string
  ): Promise<{ recordId: string; opportunity: Opportunity } | null> {
    const { records } = await client.listRecords(TABLE_NAMES.opportunities, {
      filterByFormula: `{${FO.fingerprint}} = ${quote(fingerprint)}`,
      maxRecords: 1,
    });
    if (records.length === 0) return null;
    return { recordId: records[0].id, opportunity: parseOpportunity(records[0]) };
  }

  return {
    findOpportunityRecord,

    /** The Opportunity with this fingerprint, or null. */
    async findByFingerprint(fingerprint: string): Promise<Opportunity | null> {
      const found = await findOpportunityRecord(fingerprint);
      return found ? found.opportunity : null;
    },

    /**
     * Contacts associated with an opportunity. The configured Contacts table has
     * no opportunity link column, so association is recorded in the Notes field;
     * this matches on that.
     */
    async findContactsByOpportunity(opportunity_id: string): Promise<Contact[]> {
      const { records } = await client.listRecords(TABLE_NAMES.contacts, {
        filterByFormula: `FIND(${quote(opportunity_id)}, {${FC.notes}})`,
      });
      return records.map(parseContact);
    },

    /**
     * Already-persisted Contacts whose Notes record `Company: <name>` matching
     * `company` exactly (case-insensitive). The Contacts table has no Company
     * column — the contributor scan stores it as a Notes line. The Airtable
     * FIND is a substring prefilter; the exact line match happens here so a
     * shorter company name never matches a longer one. Returned in the
     * ManualContactInput shape the contact-ranking manual adapter consumes
     * (Followers parsed from Notes so reachability recomputes faithfully).
     */
    async findContactsByCompany(company: string): Promise<ManualContactInput[]> {
      const target = company.trim().toLowerCase();
      if (target === "") return [];
      const { records } = await client.listRecords(TABLE_NAMES.contacts, {
        filterByFormula: `FIND(${quote(`company: ${target}`)}, LOWER({${FC.notes}}))`,
      });
      return records
        .filter((r) => {
          const notes = typeof r.fields[FC.notes] === "string" ? (r.fields[FC.notes] as string) : "";
          return noteLine(notes, "Company")?.toLowerCase() === target;
        })
        .map((r) => {
          const c = parseContact(r);
          const notes = typeof r.fields[FC.notes] === "string" ? (r.fields[FC.notes] as string) : "";
          const followers = Number(noteLine(notes, "Followers"));
          return {
            name: c.name,
            company,
            title: c.title,
            email: c.channels.email,
            github: c.channels.github,
            linkedin: c.channels.linkedin,
            followers: Number.isFinite(followers) ? followers : 0,
            oss_overlap: c.oss_overlap,
            relationship: c.relationship,
            existing_record_id: r.id,
          };
        });
    },
  };
}
