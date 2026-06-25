# Follow-Up Engine (Engine 8)

Schedules and drafts follow-ups so leads don't die, and **terminates cleanly**.
The state machine is **pure** (no LLM, wall-clock-independent); only the
follow-up draft uses the (injectable) Gemini client. Never more than 3
follow-ups.

## `FollowUpRequest` (input) → `FollowUpState` (output)

```ts
FollowUpRequest {
  outreach_id: string
  sent_date: Date
  channel: Channel                     // from Engine 7
  status: "Sent" | "Replied" | "No_Response" | "Bounced" | "Cancelled"
  step: number                         // last-sent state: 0=original, 1=FU1, 2=FU2, 3=FU3
  original_draft: OutreachDraft
  opportunity: Opportunity
  contact: Contact
  new_evidence?: Evidence | null       // new value to add in the follow-up
  recent_activity?: string | null      // something they shipped/posted
}

FollowUpState {
  outreach_id: string
  step: number                         // the FU being prepared (request.step+1), or terminal step
  next_due: Date | null
  draft: OutreachDraft | null
  terminal: boolean
  terminal_reason: "replied" | "no_response" | "bounced" | "cancelled" | "oss_suppressed" | null
}
```

## State machine

```
            ┌────────── status: Replied ──────────► terminal "replied"
            ├────────── status: Bounced ──────────► terminal "bounced"
            ├────────── status: Cancelled ────────► terminal "cancelled"
            ├────────── status: No_Response ──────► terminal "no_response"
            ├── category==OSS && step>=1 ─────────► terminal "oss_suppressed"
 request ──►├── step >= 3 (FU3 sent) ─────────────► terminal "no_response"
 (step)     └── else schedule FU(step+1):
                 step 0 → FU1 due = sent_date + 4 days
                 step 1 → FU2 due = sent_date + 10 days
                 step 2 → FU3 due = sent_date + 17 days
```

A response/bounce/cancel is checked **first**, so a reply arriving between
schedule and send halts the sequence before any draft is generated. The hard cap
is structural: `step >= 3` is terminal, so `output.step` never exceeds 3.

**OSS suppression**: OSS engagement is pre-application on GitHub, so the original
outreach (step 0) still gets FU1, but any *post-application* nudge (`step >= 1`)
is suppressed — terminal `"oss_suppressed"`, no draft.

## Per-step draft rules

| FU | Cap | Intent |
|---|---|---|
| FU1 | ≤60 words | add NEW value (recent PR/article/insight); never a bare reminder |
| FU2 | ≤50 words | a different angle; reference something they shipped/posted; end with a question |
| FU3 | ≤40 words | final, graceful, door open, no guilt |

Each draft is checked for the per-step word cap, banned phrases, and the opener
(first word not a greeting). On a failure the engine regenerates **once**
(≤2 Gemini calls); persistent failure returns `constraint_pass=false`.

**LinkedIn channel-switch**: for FU2 on a LinkedIn channel with a known email,
`customization_notes` recommends switching to email (a recommendation only — the
draft stays on the original channel; re-targeting is the human's call).

## Banned phrases

Engine 7's banned-phrase list is **imported** (not copied) and extended with
follow-up-specific phrases: `just following up`, `bumping this`,
`I know you're busy`, `no worries if not`, `totally understand if you're swamped`,
`hope this finds you well`, `did you get a chance`, `per my last`.

## Usage

```ts
import { buildFollowUp, computeNextStep } from "./index";

const state = computeNextStep(request, now);   // pure: step/due/terminal, no draft
const full = await buildFollowUp(request);     // also generates the draft (if due)
const full2 = await buildFollowUp(request, { client, now });
```

## Running tests

```bash
npm test
```

Covers: exact due dates (+4/+10/+17), all terminal conditions, the hard cap, OSS
suppression (incl. step-0 FU1 still scheduled), per-step word caps with
regeneration, banned phrases, new-evidence injection, the LinkedIn channel-switch
note, and the terminal no-Gemini-call guarantee. Gemini mocked.
