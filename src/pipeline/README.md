# OAOS Intake Pipeline

Wires the 12 engines into a single end-to-end run: `RawItem → PipelineResult`.
The pipeline introduces **no new behavior** — every step is an existing engine
call. It only sequences them, threads one clock + one Gemini client through the
run, and gates the optional preparation steps. It modifies no engine.

## `runPipeline(raw, options)` → `Promise<PipelineResult>`

```ts
PipelineOptions {
  inventory: Evidence[]              // required (resolves EvidenceMatch ids)
  contacts_input: DiscoveryRequest   // required (its `opportunity` is overridden)
  base_resume?: BaseResume           // + operator_profile → application package
  operator_profile?: OperatorProfile
  ask_type?: AskType                 // + channel → outreach draft
  channel?: Channel
  pipeline_thin?: boolean
  gemini_client?: GeminiClient       // injected; defaults to a real one
  now?: Date                         // one instant held for the whole run
}

PipelineResult {
  opportunity, score, evidenceMatch, recommendation, contacts,
  applicationPackage: ApplicationPackage | null,
  outreachDraft: OutreachDraft | null,
  followUpState: FollowUpState | null,   // always null at intake
  timestamp: Date
}
```

## Flow

```
normalize (E1) ─► rankContacts (E5) ─► match (E3) ─► computeScore (E2)
   ─► recommend (E4)
        ├─ action∈{Apply,Both} & base_resume & operator_profile
        │     └─► buildApplicationPackage (E6)   else null
        └─ action∈{Outreach,Both} & primary contact & channel & ask_type
              └─► buildOutreachDraft (E7)        else null
   followUpState = null (E8 runs only after a send)
```

- **Authoritative opportunity**: `normalize(raw)` is canonical; it overrides
  `contacts_input.opportunity` for contact ranking.
- **Research** is a `null` stub (placeholder for future enrichment).
- **One clock**: `now` (default `new Date()`) is passed to E3/E5 as a `Date` and
  to E2 as `now.toISOString()`, so every engine sees the same moment.
- **Gating** (per operator-confirmed rules): the application package needs BOTH
  `base_resume` and `operator_profile`; the outreach draft needs a primary
  contact, `channel`, AND `ask_type`. Missing inputs → that field is `null`.
- **role_description** for the package is `opportunity.description_norm` (falling
  back to `opportunity.role`).

## Type boundaries (zero adapters)

The two non-identical cross-engine boundaries flow directly thanks to the
structural-assignability guards already built into the engines:

- E5 `Contact[]` (`ranked.ordered`) → E2/E4 `Contact` view — assignable.
- E3 `EvidenceMatch` → E2 `EvidenceMatch` input view — assignable.

All other boundaries pass identical imported types.

## Usage

```ts
import { runPipeline } from "./index";

const result = await runPipeline(raw, {
  inventory,
  contacts_input,
  base_resume,
  operator_profile,
  channel: "email",
  ask_type: "internship_inquiry",
  gemini_client,        // inject a mock in tests
  now,
});
```

## Running tests

```bash
npm test
```

Integration tests cover: Job + contacts + evidence + resume → `Both` (both
packages non-null); OSS without a resume → application null, outreach non-null;
C-tier → both null; and empty contacts → no primary, no outreach. Gemini is
mocked by a single prompt-routing client.
