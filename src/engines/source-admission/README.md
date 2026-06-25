# Discovery Source Admission Engine (Engine 11)

Gates which sources enter automated discovery so cost/maintenance constraints
hold. A source is admitted only if **all** checks pass. **Pure, synchronous,
deterministic** — no LLM, no network.

## `admitSource(proposal, admittedSources)` → `AdmissionDecision`

```ts
SourceProposal {
  name, type: "rss"|"api"|"email_alert"|"scrape",
  auth_required, est_volume_per_week, est_maint_min_per_week,
  cost_per_month_inr, has_health_check, dedupe_compatible,
  survives_format_change, justification?
}

AdmittedSource { name, est_maint_min_per_week, probation }

AdmissionDecision {
  admit, probation, failed_checks: string[],
  global_budget_remaining_min
}
```

## Checks (all must pass to admit)

| Check | Fails when |
|---|---|
| cost | `cost_per_month_inr > 0` and no non-empty `justification` |
| maint | `est_maint_min_per_week > 10` |
| health_check | `has_health_check === false` |
| dedupe | `dedupe_compatible === false` |
| format_change | `survives_format_change === false` |
| budget | `Σ(admitted maint) + proposal maint > 50` (global) |

- **`scrape`** is not a failed check — a scrape that passes everything else is
  admitted with `probation=true`; a scrape that fails another check is rejected
  with only that other check listed.
- **`global_budget_remaining_min`** = `50 − Σ(admitted maint) − proposal maint`
  when admitted, or `50 − Σ(admitted maint)` when rejected.
- One-source-at-a-time is operational, not enforced in code — the caller passes
  the current admitted list.

## Usage

```ts
import { admitSource, GLOBAL_MAINT_BUDGET_MIN_PER_WEEK } from "./index";
const decision = admitSource(proposal, admittedSources);
```

## Running tests

```bash
npm test
```

Covers all-pass, scrape→probation, each individual failure, the global budget
breach, and the remaining-budget math in both admitted and rejected cases.
