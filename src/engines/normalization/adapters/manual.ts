// adapters/manual.ts
// File: src/engines/normalization/adapters/manual.ts
// Purpose: Manual (paste / free-text) source adapter. Handles operator-entered
//          opportunities. The only adapter that accepts unstructured text.
//
// Accepts either:
//   - a structured object: { company, role, description, comp, location,
//     remote, url } (any subset), or
//   - a free-text string, optionally with labeled lines
//     ("Company: …", "Role: …", "Compensation: …", "Location: …").
// Unlabeled prose is taken wholesale as the description; company/role then
// come back null (lower completeness → flagged for enrichment, per spec).

import type { AdapterOutput, RawItem, SourceAdapter } from "../types";
import {
  detectRemote,
  readLabeled,
  readString,
  type PayloadObject,
} from "./shared";

function extractFromObject(payload: PayloadObject): AdapterOutput {
  const description =
    readString(payload, ["description", "desc", "body", "text", "details"]) ?? "";
  const remoteField = readString(payload, ["remote", "workplace", "arrangement"]);
  return {
    company: readString(payload, ["company", "company_name", "organization", "org"]),
    role: readString(payload, ["role", "title", "position", "job_title"]),
    // Manual entries never assert a category; the engine infers it.
    category: null,
    description_raw: description,
    comp_raw: readString(payload, ["comp", "compensation", "salary", "pay", "rate"]),
    remote: detectRemote(remoteField ?? description),
    location: readString(payload, ["location", "city", "place"]),
  };
}

function extractFromText(text: string): AdapterOutput {
  const company = readLabeled(text, ["company", "organization", "org"]);
  const role = readLabeled(text, ["role", "title", "position"]);
  const comp = readLabeled(text, ["compensation", "comp", "salary", "pay", "rate"]);
  const location = readLabeled(text, ["location", "city"]);
  const remoteLabel = readLabeled(text, ["remote", "workplace", "arrangement"]);
  return {
    company,
    role,
    category: null,
    description_raw: text,
    comp_raw: comp,
    remote: detectRemote(remoteLabel ?? text),
    location,
  };
}

export const manualAdapter: SourceAdapter = {
  name: "manual",
  matches(raw: RawItem): boolean {
    return raw.source_name.trim().toLowerCase() === "manual";
  },
  extract(raw: RawItem): AdapterOutput {
    if (typeof raw.raw_payload === "string") {
      return extractFromText(raw.raw_payload);
    }
    return extractFromObject(raw.raw_payload as PayloadObject);
  },
};
