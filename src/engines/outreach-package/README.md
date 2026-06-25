# Outreach Package Engine (Engine 7)

Generates a **channel-correct outreach draft** referencing exactly one matched
evidence asset, then enforces hard channel constraints. Only the draft text
comes from the (injectable) Gemini client; all gating is **pure, deterministic,
assertion-checked** — banned phrases and lengths are never LLM-judged.

## `OutreachRequest` (input) → `OutreachDraft` (output)

```ts
OutreachRequest {
  contact: Contact                     // the primary contact
  opportunity: Opportunity
  match: EvidenceMatch                 // ranked[0] is the cited asset
  inventory: Evidence[]                // resolves ranked[0].evidence_id → URL
  ask_type: "internship_inquiry" | "oss_contribution" | "advice"
          | "collaboration" | "freelance_pitch" | "referral_request"
  channel: "email" | "linkedin_connect" | "linkedin_dm" | "github" | "slack"
}

OutreachDraft {
  channel, subject: string | null, body: string,
  word_count, char_count,              // BODY only
  evidence_referenced: string | null,  // ranked[0].evidence_id, or null (sparse)
  constraint_pass: boolean,
  constraint_violations: string[],
  customization_notes: string          // always populated
}
```

## Channel constraints

| Channel | Subject | Body limit |
|---|---|---|
| `email` | ≤10 words | ≤110 words |
| `linkedin_connect` | — | ≤300 **chars** |
| `linkedin_dm` | — | ≤80 words |
| `github` | — | ≤150 words (only if a genuine opportunity exists) |
| `slack` | — | ≤80 words |

Every `constraint_pass=true` draft additionally satisfies: **exactly one**
evidence asset referenced (the `ranked[0]` URL appears once and no other
inventory URL appears), **no banned phrase**, and an opener whose first word is
**not** a greeting.

### Banned phrases (hard substring gate)

`pick your brain`, `passionate about`, `just following up`,
`hope this finds you well`, `huge fan`, `love your work`, `I'd love to`,
`circle back`, `touch base`, `reaching out because`, `I came across your profile`.

### Opener rule

The first word of the body (stripped to letters) must not be one of
`Hi / Hello / Hey / Dear / Greetings`. Exact first-word match — "High
availability" does not trip it.

## Behaviour notes

- **Single evidence**: the orchestrator sets `evidence_referenced = ranked[0]`
  (or `null` when `ranked=[]`) and asserts the body references exactly that one
  URL. The body-URL assertion lives in `draft.ts` (it needs the inventory);
  `checkConstraints(draft, channel)` is pure and covers only length / banned /
  opener.
- **GitHub no-opportunity**: if the model returns `has_genuine_opportunity=false`,
  the engine returns immediately with `body=""`, `constraint_pass=false`, a
  `"github: no genuine technical opportunity"` violation, and a channel-switch
  note — **without** consuming the regeneration budget.
- **Regeneration**: on any constraint failure the engine regenerates **once**
  with the violations quoted as forbidden; persistent failure returns
  `constraint_pass=false`. **≤2 Gemini calls.**
- **Sparse evidence** (`ranked=[]`): reference capability generally,
  `evidence_referenced=null`, and `customization_notes` flags thin proof.

## Adding a new channel

Add the channel to the `Channel` union and `CHANNEL_LIMITS` (`config.ts`), write
a pure prompt builder under `prompts/`, and wire it into `prompts/index.ts`. The
constraint check picks up the new limits automatically.

## Usage

```ts
import { buildOutreachDraft } from "./index";

const draft = await buildOutreachDraft(request);                 // real Gemini
const draft2 = await buildOutreachDraft(request, { client });    // injected mock
```

## Running tests

```bash
npm test
```

Covers: per-channel length limits, banned-phrase detection, opener rule,
single-evidence referencing (incl. the second-asset violation), the github
no-opportunity path, the regeneration budget (clean / regenerate-once /
persistent-flag), always-populated notes, and prompt purity. Gemini mocked.
