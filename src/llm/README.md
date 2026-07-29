# src/llm — shared LLM call throttle

Rate-limits and retries every outgoing Gemini call. One module, applied at the
one client wrapper all twelve engines already route through.

## Why this exists

The Gemini free tier limits requests **per minute**, not just per day. The
prerank gate protects the daily budget (500 RPD); nothing protected the
per-minute rate. When Stage-3 discovery was first activated it emitted ~123
calls as fast as the pipeline could produce them, 429'd on a large fraction of
them, and wrote 14 of 25 opportunities with defaulted scores and generic
evidence reasons — while reporting a successful run. See CHANGELOG.md.

## Surface

```ts
import { getGeminiCallStats, resetGeminiCallStats } from "../llm";
```

Everything else is internal. Engines and the pipeline never import this module:
they use `createGeminiClient()` as they always have, and the throttle is applied
inside it.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `GEMINI_MAX_RPM` | `12` | Requests-per-minute ceiling. Spacing = 60000/RPM. |
| `GEMINI_MAX_ATTEMPTS` | `4` | Total attempts per call (1 try + 3 retries). |
| `GEMINI_RETRY_BUDGET_MS` | `60000` | Hard ceiling on one call's total backoff. |
| `GEMINI_BACKOFF_BASE_MS` | `2000` | First backoff delay; doubles per retry. |
| `GEMINI_BACKOFF_MAX_MS` | `30000` | Per-attempt cap, also clamps `Retry-After`. |

A malformed value **warns and falls back to the default** rather than throwing —
a throw here would land in an engine's `catch` and be re-reported as "the LLM
failed", which is the invisible-failure class this module removes.

### On the RPM default

**Provenance of the number:** the OAOS-v2 Google Cloud project was recorded at
**15 RPM / 500 RPD per model** — the operator's own reading of the AI Studio
rate-limit dashboard, noted in CLAUDE.md. That figure was **not re-verified**
when this throttle was written, and Google has changed free-tier limits before.
Treat 15 as operator-recorded, not as gospel; if 429s reappear at a paced rate,
check the dashboard before assuming a code defect.

The default of 12 leaves ~20% headroom under it. The margin is not superstition:
the server's minute is a sliding window that our fixed spacing cannot align
with, so pacing at exactly the ceiling still produces boundary 429s.

## What a run costs

Measured by `npx tsx src/llm/scripts/simulate-run.ts` — the real throttle
against a fake clock, no live call:

- **~4.9 Gemini calls per opportunity** (research 1 + scoring 1–2 + evidence
  1–6), spread 3–6.
- **A 25-opportunity Stage-3 run takes ~10 minutes** at the default 12 RPM.
  API latency (~1.5s) is fully absorbed by the 5s pacing interval.
- **~101 opportunities/day** against the 500 RPD cap ≈ **4 full runs of 25**.

This is the normal shape of a real discovery run: fire it and walk away. There
is no configuration that is both fast and correct on the free tier — and the
un-throttled regime is not the fast one. Retrying into a saturated limiter
measured *slower* (13m 23s) than pacing correctly (10m 12s) **and** lost 14
calls permanently. See the table in CHANGELOG.md.

## Behavior

- **Pacing.** A slot is reserved synchronously before any `await`, so
  concurrent callers get distinct slots. Each *attempt* consumes one — a retry
  is a request too.
- **Retry.** HTTP 429 only. Equal-jitter exponential backoff (2s/4s/8s),
  honoring `Retry-After` when present, clamped to the per-attempt cap. The
  retry budget is checked independently of attempts remaining; it is what stops
  a pathological all-429 sequence from hanging a run.
- **Everything else is untouched.** Non-429 errors throw on the first attempt.
  After exhausted retries the original error is rethrown, so every engine's
  existing degradation path behaves exactly as it did before this module
  existed.
- **The limiter is process-wide.** The ceiling belongs to the API key, not to a
  client object, and `score.ts`/`match.ts` each default-construct their own
  client when none is injected. Per-instance limiters would multiply the real
  rate by the number of clients.

## Observability

`oaos discover --stage3` prints a Gemini block under the run summary: total
calls, how many hit the rate limit, how many recovered on retry, how many
failed permanently, and time spent waiting. A retried-then-succeeded call is
now visibly distinct from a permanent failure — previously they were
indistinguishable in the logs, which is why the defect was invisible until
someone audited Airtable by hand.

When calls do fail permanently the block names the remediation: lower
`GEMINI_MAX_RPM`, then re-score the affected records with
`oaos score --company <name>`.

## Testing

`vitest run src/llm`. Fixture-driven with a fake HTTP layer — no live Gemini
call, ever. **No test sleeps:** time is injected, and the fake clock advances
virtual time on zero-delay macrotasks, resolving the earliest deadline first so
concurrent waiters observe distinct times.
