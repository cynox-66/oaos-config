# Prerank Gate

Pure lexical pre-filter sitting between Stage-3 discovery batches and the
Gemini-powered pipeline. It selects the top-K most plausibly-relevant items
from a batch so that only survivors consume LLM budget — and records a reason
for every item that does not make the cut.

**100% pure TypeScript.** No LLM calls, no network, no file I/O. Vocabulary and
config are passed in by the caller.

## Attribution

The two-tier funnel idea (cheap lexical rank first, expensive analysis second)
is borrowed from jobsync's `greenhouse/rank.ts` (MIT). The approach is the
reference; the code here is written fresh for OAOS.

## Why it exists

The Gemini free tier allows **500 requests/day**. The existing pipeline spends
up to **~4 calls per item** (3 evidence-matching reasons + 1 scoring). At
multi-source Stage-3 volume, an unfiltered nightly batch would blow through the
daily cap and cause silent quality degradation — engines fall back, everything
still gets written, and nothing looks broken.

### Budget math

```
worst-case Gemini calls per invocation = maxPerRun x ~4
                                       = 25 x 4
                                       = 100 requests
```

That is **per invocation**, not per day. The operator controls invocation
frequency; five runs a day at the default `maxPerRun` still lands at 500, so
treat 25 as sized for roughly 1–4 runs/day with headroom. Lower `maxPerRun`
if you intend to run more often.

## Usage

```typescript
import { prerank, DEFAULT_VOCABULARY } from "../discovery/prerank";

const result = prerank({
  items,                          // RawItem[] from a Stage-3 source
  vocabulary: DEFAULT_VOCABULARY, // or preferences.json-derived (Wave 1)
  config: { maxPerRun: 25 },      // optional; merged over defaults
});

for (const item of result.passed) {
  // normalize() -> runPipeline() -> persist   (unchanged existing path)
}
for (const { item, reason, score } of result.gated) {
  // persist un-analyzed, with the reason recorded. Never discard.
}
```

`vocabulary` is **required** — there is deliberately no implicit fallback to
`DEFAULT_VOCABULARY` inside `prerank()`. Callers import and pass it explicitly,
so swapping in `preferences.json` in Wave 1 is a one-line call-site change and
it is impossible to silently run on stale built-in vocabulary.

Wiring into `oaos discover` happens when Stage 3 lands; this module has no live
caller yet.

## Algorithm (deterministic, order matters)

1. **Text extraction** — from `raw_payload` only (`string` used directly;
   `object` walked to depth 6 collecting string leaves, schema-agnostic).
   HTML stripped, minimal entities decoded, lowercased, whitespace collapsed.
   `url` and `source_name` are excluded: URL slugs would inject vocabulary
   matches no human wrote.
2. **Hard gates**, cheapest first:
   - `insufficient_text` — under 40 chars of cleaned text.
   - `negative_term` — any `negativeTerms` match.
   - `location` — only when `remoteOnly` (default `true`): text matches an
     onsite pattern **and** no remote pattern. `hybrid` counts as onsite under
     OAOS's remote-only scope. Deliberately conservative — ambiguous items
     pass, because a false positive loses a real opportunity while a false
     negative leaks only a little budget.
3. **Lexical relevance** — IDF-weighted overlap with `domainTerms ∪ roleTerms`,
   IDF computed against the current run's corpus (the whole `items` batch, as
   fetched):

   ```
   idf(t)  = ln((N + 1) / (df(t) + 1))     // exactly 0 when df = N, always >= 0
   raw(i)  = sum of idf(t) over vocab terms matched by item i
   score(i)= raw(i) / sum of idf(t) over all vocab terms with df >= 1
   ```

   Batch-relative IDF means a term appearing in every posting of a batch
   ("engineer" in a batch of engineering roles) contributes nothing, while a
   discriminative term ("ebpf") dominates.

   **Homogeneous-batch fallback.** If the normalization denominator is 0 but
   vocabulary matches do exist — every matched term has `df = N`, which is what
   a single-company board run looks like — the score falls back to plain
   overlap: `matched terms / vocabulary terms present in the batch`. Without
   this, a 100%-relevant batch would score 0 across the board and be gated out
   wholesale, silently, which is the exact opposite of this module's purpose.
   The all-zero path is reserved for the genuine no-match case (no vocabulary
   term appears anywhere in the batch), where gating everything is correct.

4. **Relevance floor** — `score < relevanceFloor` (default `0.05`) →
   `below_floor`.
5. **Top-K** — survivors sorted by score desc, `fetched_at` desc as tiebreak
   (newer first; unparseable timestamps sort last), then input order. The first
   `maxPerRun` pass; the rest are gated `beyond_k` **with their scores**, so a
   near-miss is visible rather than lost.

Term matching is word-boundary based and uniform across vocabulary, negative,
and location patterns, so multi-word phrases work (`site reliability`) and
`sre` does not match inside `stressed`.

## Invariants

- `passed.length + gated.length === items.length` — asserted in the module
  (throws on violation) and on every test fixture.
- **Nothing is ever dropped without a recorded reason.** Gated items are
  returned in full, with their gate reason and (where scored) their score.
- Deterministic: same input → byte-identical output. The only nondeterministic
  value is `stats.runTimestamp`, which is injectable via `deps.now` for tests.

## Output

`stats` is shaped for Engine 9 (Source Performance) consumption:

```typescript
{
  total, passed, gated,
  gatedByReason: Record<GateReason, number>,  // all five keys, zero-filled
  runTimestamp: string                        // ISO-8601
}
```

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | Type definitions (imports `RawItem` from Engine 1; never redefines it) |
| `config.ts` | `DEFAULT_PRERANK_CONFIG`, `DEFAULT_VOCABULARY`, gate patterns — pure data |
| `text.ts` | Extraction, cleaning, tokenization, boundary-aware term matching |
| `prerank.ts` | `prerank()` — gates, scoring, top-K, invariant assertion |
| `index.ts` | Public surface |
| `tests/` | Fixture-based unit tests (no live data, no network) |
