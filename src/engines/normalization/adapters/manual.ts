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

import type { AdapterOutput, Category, RawItem, SourceAdapter } from "../types";
import {
  detectRemote,
  readLabeled,
  readString,
  type PayloadObject,
} from "./shared";

/** The canonical categories the operator may assert directly (spec Section 1). */
const CATEGORIES: readonly Category[] = [
  "Job",
  "Internship",
  "Freelance",
  "Startup",
  "OSS",
  "Other",
];

/** Read an operator-asserted category from the payload, if it is a valid one. */
function readCategory(payload: PayloadObject): Category | null {
  const raw = readString(payload, ["category"]);
  return raw !== null && (CATEGORIES as readonly string[]).includes(raw)
    ? (raw as Category)
    : null;
}

function extractFromObject(payload: PayloadObject): AdapterOutput {
  const description =
    readString(payload, ["description", "desc", "body", "text", "details"]) ?? "";
  const remoteField = readString(payload, ["remote", "workplace", "arrangement"]);
  return {
    company: readString(payload, ["company", "company_name", "organization", "org"]),
    role: readString(payload, ["role", "title", "position", "job_title"]),
    // A structured manual entry MAY assert its category (e.g. from the CLI's
    // category menu); when present and valid it is taken as-is and the engine
    // skips inference (normalize.ts uses `extracted.category ?? inferCategory`).
    // When absent, the engine infers it as before.
    category: readCategory(payload),
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
