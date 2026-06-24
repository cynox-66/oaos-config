# Recommended Action Engine (Engine 4)

Maps a scored opportunity to one directive — **Apply / Outreach / Both / Ignore** —
removing per-opportunity deliberation. It is a **pure, synchronous, deterministic**
function: no LLM, no network, no async. The decision table is encoded as an
ordered array of rule objects (`rules.ts`), evaluated top-down, first match wins,
with a catch-all guaranteeing totality.

## `ActionRequest` (input) → `Recommendation` (output)

```ts
ActionRequest {
  opportunity: Opportunity            // uses category
  score: Score                        // uses tier, confidence, tier_uncertain, total
  contacts: Contact[]                 // "reachable" = some contact.reachability >= 3
  evidence_match?: EvidenceMatch|null // only coverage_gap is read (top_score unused here)
}

Recommendation {
  action: "Apply" | "Outreach" | "Both" | "Ignore"
  reason: string                      // matched rule's reason, gap-augmented
  requires_human_review: boolean
}
```

`requires_human_review = score.confidence < 0.6 OR score.tier_uncertain OR
coverage_gap present` — independent of the action. When a `coverage_gap` is
present, the reason is augmented: `"<rule reason> (coverage gap: <gap>)"`.

## Decision table

Evaluated top-down; **first match wins**. "reachable" = a contact with
`reachability ≥ 3`.

| # | tier | category | reachable? | → action | notes |
|---|---|---|---|---|---|
| 0 | C | * | * | **Outreach** | pipeline-thin mode only, `total ≥ 45` (else falls through) |
| 1 | C | * | * | **Ignore** | conserve effort |
| 2 | * | OSS | yes | **Outreach** | relationship-led, no apply form |
| 3 | * | OSS | no | **Outreach** | find/warm a contact first |
| 4 | S·A | Job/Intern | yes | **Both** | apply + reach the human |
| 5 | S·A | Job/Intern | no | **Apply** | no human → formal apply only |
| 6 | S·A | Freelance | yes | **Outreach** | won by pitch, not application |
| 7 | S·A | Freelance | no | **Apply** | platform proposal |
| 8 | S·A | Startup | yes | **Both** | |
| 9 | S·A | Startup | no | **Outreach** | cold-reach the founder |
| 10 | B | Job/Intern | yes | **Outreach** | apply only if effort is low; lead with the human |
| 11 | B | * | no | **Ignore** | conserve effort |
| 12 | * | * | * | **Ignore** | catch-all (totality) |

Combinations not listed in the spec table (e.g. `category = Other` at a non-C
tier, or `B / Freelance·Startup·Other / reachable`) fall through to the
catch-all → **Ignore**.

### pipeline-thin mode

`recommend(request, { pipeline_thin: true })` promotes **top-of-C** (`tier C`
and `score.total ≥ 45`) from Ignore to Outreach, regardless of category or
reachability. Human-toggled, never automatic; default off.

## Adding a new rule

Insert a `Rule` object into the `RULES` array in `rules.ts` at the correct
priority (order is significant — earlier rules win). Each rule is
`{ predicate, action, reason }`; keep predicates defensive (optional access) so
a malformed request still falls through to the catch-all rather than throwing.
The catch-all (`predicate: () => true`) must remain last.

## Usage

```ts
import { recommend } from "./index";

const rec = recommend({ opportunity, score, contacts, evidence_match });
const thin = recommend(request, { pipeline_thin: true });
```

## Running tests

```bash
npm test
```

Covers: totality across all 48 tier×category×reachable combinations,
determinism, table order, the three `requires_human_review` triggers,
pipeline-thin thresholds, catch-all robustness on malformed input, and
hand-verified spec-table cases. Pure function — no mocks needed.
