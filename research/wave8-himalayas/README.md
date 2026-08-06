# wave8-himalayas — activation records (2026-08-06)

Wave 8, ruling Q5: the Himalayas activation. Findings live in CLAUDE.md's
"HIMALAYAS ACTIVATED" entry and in docs/known-issues.md #23 / #25–#28; this
directory holds the harness that produced the numbers.

## analyze-dryrun.ts

`runStage3` returns COUNTS only — no items, no fingerprints (a limitation
recorded in both the seniority and G1 wave entries). The CLI dry-run is
therefore authoritative for the counts but cannot show WHICH items passed,
their geo signals, or prerank's IDF internals. This script fetches the same
corpus once and replays it through the SAME shipped modules (real sources,
real normalize, real geo mapper, real prerank, real vocabulary from the
operator's confirmed v3 scope).

It produced two things now cited in CLAUDE.md and known-issues.md, so it is
committed rather than left local — unreproducible evidence is worse than none:

- **The #23 title-clean measurement**: of 18 `negative_term` gates, 10 have no
  shipped seniority term in their title (gated on body prose alone), including
  an India-eligible `Kubernetes Infrastructure Engineer`.
- **The IDF figures**: maxAchievable 21.07 over 18 present terms, none at
  idf=0 — the mixed batch removing the degeneracy G1's geo arm measured
  (2.78, 3 of 9 terms at idf=0).

**Precision caveat, restated here because the figures are cited:** the script
applies `insufficient_text` + `negative_term` but NOT the `location` gate, so
it computes IDF over N=12 where prerank used N=11. A term at df=11 would be
idf=0 on prerank's true basis, and the df distribution is not printed, so the
exact figure is approximate. The conclusion (the homogeneous fallback does not
fire) is robust — one item cannot collapse 18 terms to zero.

**Cost: 17 live requests** (4 greenhouse boards + 13 himalayas scope terms; no
healthCheck, so it does not repeat #16's 2x). Zero Gemini, zero writes,
`preferences.json` read-only. Run: `npx tsx research/wave8-himalayas/analyze-dryrun.ts`.
Excluded from `vitest run` by filename, same convention as `live-verify*.ts` /
`verify-seniority.ts` / `verify-g1-replay.ts`.
