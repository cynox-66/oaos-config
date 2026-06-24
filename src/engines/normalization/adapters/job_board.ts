// adapters/job_board.ts
// File: src/engines/normalization/adapters/job_board.ts
// Purpose: Generic job-board source adapter. The default fallback for any
//          non-manual source. Maps common scraped-JSON field shapes; falls
//          back to treating a string payload as the description.
//
// Category: derived from source_type where unambiguous (internship / freelance
// / oss / startup_signal). For source_type "job_board" / "network" it is left
// null so the engine's keyword inference runs (catching e.g. an internship
// posted on a general board).

import type { AdapterOutput, Category, RawItem, SourceAdapter } from "../types";
import {
  detectRemote,
  readString,
  type PayloadObject,
} from "./shared";

function categoryFromSourceType(raw: RawItem): Category | null {
  switch (raw.source_type) {
    case "internship":
      return "Internship";
    case "freelance":
      return "Freelance";
    case "oss":
      return "OSS";
    case "startup_signal":
      return "Startup";
    default:
      return null; // job_board | network → infer from text
  }
}

function extractFromObject(raw: RawItem, payload: PayloadObject): AdapterOutput {
  const description =
    readString(payload, ["description", "desc", "body", "details", "summary"]) ?? "";
  const remoteField = readString(payload, [
    "remote",
    "workplace_type",
    "location_type",
    "work_arrangement",
  ]);
  const employmentType = readString(payload, ["employment_type", "job_type", "type"]);
  return {
    company: readString(payload, [
      "company",
      "company_name",
      "organization",
      "employer",
    ]),
    role: readString(payload, ["role", "title", "job_title", "position"]),
    category: categoryFromSourceType(raw),
    description_raw: description,
    comp_raw: readString(payload, [
      "comp",
      "compensation",
      "salary",
      "salary_range",
      "pay",
      "rate",
    ]),
    remote: detectRemote([remoteField, employmentType, description].filter(Boolean).join(" ")),
    location: readString(payload, ["location", "city", "place", "region"]),
  };
}

function extractFromText(raw: RawItem, text: string): AdapterOutput {
  return {
    company: null,
    role: null,
    category: categoryFromSourceType(raw),
    description_raw: text,
    comp_raw: null,
    remote: detectRemote(text),
    location: null,
  };
}

export const jobBoardAdapter: SourceAdapter = {
  name: "job_board",
  // Fallback adapter — matches anything (selection order puts it last).
  matches(): boolean {
    return true;
  },
  extract(raw: RawItem): AdapterOutput {
    if (typeof raw.raw_payload === "string") {
      return extractFromText(raw, raw.raw_payload);
    }
    return extractFromObject(raw, raw.raw_payload as PayloadObject);
  },
};
