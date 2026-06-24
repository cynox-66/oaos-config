# Application Package Engine (Engine 6)

Generates a tailored **resume variant + cover letter** for Apply/Both
opportunities so the operator edits rather than authors. The resume variant is
**pure** (a reorder of the base resume — never invents); only the cover letter
uses the (injectable) Gemini client. A hard **fabrication trace-check** gates the
output.

## `PackageRequest` (input) → `ApplicationPackage` (output)

```ts
PackageRequest {
  opportunity: Opportunity
  match: EvidenceMatch                 // ranked carries evidence_ids only…
  inventory: Evidence[]                // …resolved to full Evidence here
  base_resume: BaseResume
  operator: OperatorProfile            // { name, github, portfolio_url, stack }
  role_description: string
}

ApplicationPackage {
  resume_variant: BaseResume           // reordered/re-emphasized base
  cover_letter: string                 // ≤250 words
  evidence_cited: string[]             // ≤2 evidence_ids (the proof points)
  fabrication_check: "pass" | "flag"
  flagged_sentences: string[]          // sentences that failed the check
  notes: string                        // proof-thin / truncation / gap warnings
}
```

### `BaseResume`

```ts
BaseResume {
  name: string
  summary: string
  experience: { company, title, dates, bullets: string[] }[]
  projects:   { name, url?, description, bullets: string[], tech_tags: string[] }[]
  education:  { institution, degree, dates }[]
  skills: string[]
}
```

`resume_variant` is the **same shape** — a reordered copy.

## How it works

1. **Resume variant** (`buildResumeVariant`, pure): projects, experience entries,
   and bullets-within-entry are sorted by relevance to
   `opportunity.domain ∪ matched-evidence tech_tags/domains` (resolved from the
   inventory), descending, stable for ties — pulling matched-evidence projects to
   the top. It **reorders only**: every bullet in the variant exists in the base
   (never invents, never drops).
2. **Cover letter** (`generateCoverLetter`, Gemini): a ≤250-word letter,
   structured hook → 2 proof points (the first ≤2 ranked evidence) → fit + ask,
   with tone by category (startup = direct/builder; else structured/credentialed).
3. **Fabrication check** (`checkFabrication`, pure): see below.
4. **Regeneration budget**: generate → check fabrication **and** word count → if
   either fails, regenerate **once** with combined corrective instructions
   (forbidden claims quoted + word limit emphasized) → re-check → if still over
   the cap, hard-truncate to 250 words at a sentence boundary. **≤2 Gemini calls.**

## Fabrication check

Runs on the **cover letter only** — the resume variant is a pure reorder and
cannot fabricate by construction. The allowed corpus is the base resume + the
evidence inventory (titles/tech_tags/domains/blurbs) + the opportunity
(company/role/role-description). A sentence is flagged when:

- it makes a **years-of-experience** claim not present in the base resume, **or**
- it contains a **seniority/title keyword** (Staff, Principal, Senior, Lead,
  Manager, Director, Head, VP, Chief) absent from the base resume's titles, **or**
- more than 3 of its tokens (length > 2) are absent from the allowed corpus.

`fabrication_check = flag` if any sentence flags, else `pass`; flagged sentences
are returned. `pass` is required before a package is eligible for human review.

## Usage

```ts
import { buildApplicationPackage } from "./index";

const pkg = await buildApplicationPackage(request);                 // real Gemini
const pkg2 = await buildApplicationPackage(request, { client });    // injected mock
```

## Running tests

```bash
npm test
```

Covers: resume-variant determinism / relevance reordering / no-invention,
fabrication pass + flag (years, titles, untraceable), tone by category, the
regeneration budget (clean / regenerate-once / persistent-flag), sparse-evidence
notes, `evidence_cited` membership, the never-assert guard, and word-cap
truncation. Gemini mocked throughout.
