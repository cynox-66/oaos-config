# Changelog — LLM Call Throttle

## [0.1.0] — 2026-07-29

Initial implementation. A defect fix, not a feature wave: the first real
activated Stage-3 run (Greenhouse, 2026-07-28) reported success while HTTP
429ing on a large fraction of its Gemini calls. An Airtable audit of the 25
written records found **14 with defaulted scores** (six at 3/0/3, eight at
3/5/8) and **zero opportunity-specific evidence reasoning on any record**. The
pipeline degraded gracefully exactly as designed — and produced largely
unusable output while reporting a clean run.

### Root cause

25 opportunities × ~5 Gemini calls each ≈ 123 requests, issued as fast as the
pipeline could emit them. **The free tier limits requests per minute, not just
per day.** The prerank gate protects the daily budget (500 RPD); nothing
protected the per-minute rate. The regime had never occurred before because
manual Stage-1 intake feeds the pipeline one opportunity at a time — the defect
was created by Stage-3 activation, not by any change to the engines.

### The finding that forecloses "just retry harder"

The Step-2 simulation ran the real throttle against a fake clock at four
configurations. The pre-fix regime is **strictly worse on both axes** — not a
speed-for-correctness tradeoff:

```
  RPM  429-rate  opportunities  calls  attempts  429'd  recovered  failed  elapsed
   12        0%             25    123       123      0          0       0  10m 12s
   12        5%             25    119       124      5          5       0  10m 17s
   15        0%             25    123       123      0          0       0   8m 10s
   60       60%             25    127       267     72         58      14  13m 23s
```

Retrying into a saturated limiter (last row) takes **13m 23s and still loses 14
calls permanently**. Pacing correctly (first row) takes **10m 12s and loses
none**. There was never a fast-and-correct option to give up: throttling is
faster *and* correct. Do not reopen this as "can we skip the throttle and just
retry more aggressively" — it has been measured.

Also measured: a 5% residual 429 rate costs **5 seconds**, not minutes. Retries
are cheap once pacing has flattened the burst. And the 1.5s API latency is
fully absorbed by the 5s pacing interval, so response time does not add to
wall-clock.

### Added

- `src/llm/throttle.ts` — `createThrottle(deps)`, the wrapper every outgoing
  Gemini call passes through. Paces to a requests-per-minute ceiling and
  retries HTTP 429 with exponential backoff. Pacing uses a synchronously
  reserved slot (`nextSlotAt` advances before any `await`), so concurrent
  callers each get a distinct slot and cannot interleave onto the same one.
  **Each attempt takes a slot — a retry is a request too.**
- `src/llm/shared.ts` — `sharedThrottle()`, the ONE process-wide throttle, and
  `parseRetryAfterMs` (delta-seconds and HTTP-date forms).
- `src/llm/stats.ts` — the run tally: total, rateLimited, succeededAfterRetry,
  failedPermanently, throttleWaitMs, backoffWaitMs. `getGeminiCallStats()`
  returns a copy; `resetGeminiCallStats()` zeroes it.
- `src/llm/config.ts` — `resolveThrottleConfig(env)` and the defaults.
- `src/llm/scripts/simulate-run.ts` — the simulation above. Excluded from
  `vitest run` by filename (vitest's default glob is `**/*.{test,spec}.*`,
  and there is no vitest.config.ts to special-case), same convention as the
  Wave 3/4 live-verify scripts. Unlike those, it touches **no network at all**.

### Changed

- `src/engines/scoring/gemini.ts` — the fetch body is unchanged; it is now
  wrapped in `throttle(...)`, and the `!res.ok` throw became `HttpStatusError`.
  **The only engine file touched.** Every engine already routed through this
  one factory, so one wrapper covers all twelve without an engine change.
- `cli/format.ts` — `formatGeminiStats(stats)`.
- `cli/commands/stage3.ts` — zeroes the tally before the run, prints it after.

### Design decisions worth not relitigating

- **The limiter is process-wide, not per-client.** The RPM ceiling belongs to
  the API key, not to a client object. `score.ts:321` and `match.ts:308` each
  default-construct their own `createGeminiClient()` when no client is
  injected, so a per-instance limiter would let N clients each pace to the full
  ceiling and multiply the real rate by N — reproducing the exact defect.
- **Failure shape is unchanged.** After exhausted retries the ORIGINAL error is
  rethrown. `HttpStatusError` is an `Error` whose message is byte-identical to
  what the client threw before this module existed
  (`Gemini request failed: HTTP 429`); `status` is additive and read only
  inside this module. A test asserts a real engine's degradation path
  (`computeScore` → rule-pass only, confidence ≤ 0.4) still triggers.
- **429 is the only retried status.** Non-429 errors throw on attempt 1 with
  zero retries, asserted by attempt count.
- **The retry budget is a hard ceiling checked independently of attempts
  remaining.** That, not the attempt count, is what terminates a pathological
  all-429 sequence.
- **A malformed env value warns and uses the default rather than throwing.**
  Every caller sits inside an engine's `catch` → degrade path, so a thrown
  config error would be swallowed and re-reported as "the LLM failed" — the
  exact invisible-failure class this module exists to remove.
- **Stats print in the Stage-3 summary only.** Single-opportunity paths
  (`oaos intake`, Stage-2 discover) cannot hit a per-minute ceiling; the same
  block there would be noise on every run, and noise on every run is how a
  reader learns to skip output.

### Tests

34 new (3 files: throttle, gemini-client, config) + 4 in `cli/tests/format.test.ts`.
Full suite 924 green (74 files), up from 890/71.

**No test sleeps.** Time is an injected clock; the fake advances a virtual
timestamp on zero-delay macrotasks, resolving the earliest pending deadline
first. That ordering matters — a naive "advance t by ms on every sleep" clock
lets five parallel waiters all wake at the last one's deadline, which hides the
very pacing bug the tests exist to catch (it did, on the first run).

### Not addressed

No request timeout — see docs/known-issues.md #15. Pre-existing; the throttle
makes it slightly more consequential, since a hung call now holds the shared
paced queue instead of stalling one opportunity.
