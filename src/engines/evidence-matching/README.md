# Evidence Matching Engine (Engine 3)

Selects the 1–3 evidence assets that best prove capability **for a specific
opportunity**, each with a grounded one-line reason, plus a `coverage_gap` when
the opportunity's top capability has no strong proof. The scoring, ranking, and
coverage logic are **pure and deterministic**; only the per-asset reason string
uses an (injectable) Gemini call.

## `Evidence` schema

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable unique slug. |
| `title` | `string` | Human title. |
| `type` | `PR \| Article \| RFC \| Project \| Talk \| Freelance \| Client` | |
| `url` | `string` | Link to the asset. |
| `tech_tags` | `string[]` | Technology tags (align casing with the domain vocab where they overlap). |
| `domains` | `string[]` | Controlled-vocab domain labels. |
| `relevance_blurb` | `string` | One line: what the asset proves. |
| `recency_date` | `string` | ISO date (`YYYY-MM-DD`). |
| `strength` | `number` | 1..5. |

`MatchRequest = { opportunity, inventory: Evidence[] }` →
`EvidenceMatch = { id, ranked: [{evidence_id, fit_score, reason}] (≤3), top_score, coverage_gap }`.

## Fit formula

```
fit = 0.45·tag_overlap_ratio
    + 0.30·domain_overlap_ratio
    + 0.15·(strength/5)
    + 0.10·recency_factor

*_overlap_ratio = |intersection| / |opportunity side|   (0 if the side is empty)
recency_factor  = 0.5^(age_months / 18), clamped to [0,1]   (missing date → age 36mo)
```

- **Opportunity tag set** (for `tag_overlap_ratio`): `opportunity.domain` unioned
  with whole-word tag matches scanned out of `role + description_norm` against
  the inventory's tag vocabulary.
- **Candidate filter**: keep evidence sharing ≥1 domain or tech_tag.
- **Ranking**: fit desc; ties (within 0.001) broken by type preference
  (security/eBPF → PR, RFC; freelance → Freelance, Client, Project;
  writing/devrel → Article, Talk); deduped by id; floored at **0.25**; top 3.
- **`coverage_gap`**: the opportunity tag most frequently tagged across the
  inventory; if no asset proves it at `fit ≥ 0.4`, that tag is named (else null).
  Empty opportunity tag set → null.
- **Reason**: LLM-generated, then a hard fabrication trace-check (reject if >3
  reason tokens are absent from `relevance_blurb + role + description`); one
  stricter retry; on repeated fabrication or transport failure, fall back to the
  `relevance_blurb` (truncated to 120 chars). Never empty.

## The inventory (`evidence/inventory.md`)

The C4 source of truth lives at repo-root `evidence/inventory.md`. It is
human-editable markdown whose **single fenced `json` block** holds an array of
`Evidence` objects. The engine reads only that block via `parseInventory` /
`loadInventory`; the surrounding prose is documentation.

**To add an asset**: append an object to the `json` array following the schema
above. Keep `tech_tags` casing aligned with the domain vocabulary
(e.g. `eBPF`, `Kubernetes`, `Web/Frontend`) so tag/domain overlap is exact.

## Usage

```ts
import { match } from "./index";
import { loadInventory } from "./inventory";

const inventory = loadInventory("evidence/inventory.md");
const result = await match({ opportunity, inventory });        // real Gemini client
const r2 = await match({ opportunity, inventory }, { client: myMock, now });
```

The produced `EvidenceMatch` is structurally assignable to the `EvidenceMatch`
input view Engine 2 declares (compile-time–checked in the tests).

## Running tests

```bash
npm test
```

Covers: deterministic fit ranking, top-1 accuracy on ≥10 labeled pairs (≥75%),
the 0.25 floor and top-3 cap, recency decay (18-month half-life), type-preference
tie-break, id dedupe, `coverage_gap`, the zero-match path, and the LLM reason
pass (attachment, grounding, fabrication retry/fallback). Gemini is mocked
throughout — no real API calls.
