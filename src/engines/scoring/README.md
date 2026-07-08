# Opportunity Scoring Engine (Engine 2)

Scores a normalized `Opportunity` on two axes — Quality (0–50) and Match (0–50) —
into a `Score` with a tier (S/A/B/C), confidence, and rationale, so finite
outreach/application effort is allocated. It executes `scoring/rubric.md`.

The engine is **two-pass**:

- **Rule pass** (pure, deterministic, no I/O) computes five factors from
  structured input: `quality.oss` (`research.oss_involvement`), `quality.stage`
  (`research.stage`), `match.contact` (best contact reachability),
  `match.evidence` (`evidence_match.top_score`), `match.network` (best contact
  relationship).
- **LLM pass** (Gemini 3.5 Flash) scores the three judgment factors —
  `quality.domain`, `quality.leverage`, `match.overlap` — returning JSON only,
  which is schema-validated and clamped before use.

The two are merged: factors are summed to `quality.total` / `match.total` /
`total`, the tier is derived by threshold (**S≥85, A≥70, B≥50, else C**), and the
equity/unpaid leverage cap is applied (non-OSS only). Only LLM-judgment factors
may vary between runs; everything rule-based is reproducible.

## `ScoreRequest` (input)

```ts
ScoreRequest {
  opportunity: Opportunity            // from Engine 1
  research: Research | null           // { stage?, oss_involvement?, ... } (opaque)
  contacts: Contact[]                 // input view: { id, reachability, relationship }
  evidence_match: EvidenceMatch | null// input view: { id?, top_score }
}
```

`Contact`, `EvidenceMatch`, and `Research` are **input-only** views of other
engines' outputs (Engines 5, 3, and research enrichment). Engine 2 reads them;
it never builds them.

## `Score` (output)

```ts
Score {
  quality: { domain, oss, leverage, stage, total }   // 0..50
  match:   { overlap, evidence, contact, network, total } // 0..50
  total: number                       // 0..100
  tier: "S" | "A" | "B" | "C"
  confidence: number                  // 0.5·completeness + 0.3·(research?1:0) + 0.2·(contacts?1:0)
  rationale: string
  scored_at: string                   // ISO datetime
  inputs_hash: string                 // sha1(fingerprint | research_version | contacts_ids | evidence_id)
  tier_uncertain: boolean             // total within 2 of a boundary AND confidence < 0.6
}
```

## Behavior notes

- **Idempotency** — `computeScore(request, { previous })` returns `previous`
  unchanged (no LLM call) when `previous.inputs_hash` matches the recomputed hash.
- **LLM failure** — malformed JSON triggers one retry with a stricter "JSON
  only" instruction; a second failure degrades to a rule-pass-only score with
  `rationale = "LLM scoring unavailable"` and `confidence ≤ 0.4`.
- **Clamping** — out-of-range LLM integers are clamped to each factor's max (and
  up to 0), with an anomaly logged. A parseable response missing a field
  defaults that field to 0 (no retry).
- **Leverage cap** — non-OSS `equity` caps `quality.leverage` at 8; non-OSS
  `unpaid` caps it at 5; OSS is never capped.

## Gemini client

The LLM call goes through an injectable `GeminiClient` (`gemini.ts`). Production
uses `createGeminiClient()` (reads `process.env.GEMINI_API_KEY`, posts to
`gemini-3.5-flash:generateContent`). Tests inject a mock — **no real API calls in
the test suite**.

## Usage

```ts
import { computeScore, createGeminiClient } from "./index";

const score = await computeScore(request);                 // real Gemini client
const score2 = await computeScore(request, { previous });  // idempotent re-score
const score3 = await computeScore(request, { client: myMock, now });
```

## Running tests

```bash
npm test
```

Covers: rule-pass determinism + mappings, `inputs_hash` composition, confidence
formula, monotonicity, clamping, LLM retry/degrade, idempotency,
`tier_uncertain` boundaries, the leverage cap, and ≥10 calibration fixtures with
no catastrophic inversions.
