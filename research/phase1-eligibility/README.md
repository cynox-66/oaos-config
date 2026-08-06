# phase1-eligibility — research + G1 build records (2026-08-06)

The discovery-eligibility research session (geo / regional duplicates / GTM
contamination / provider mapping) and the wave-G1 build records it produced.
Start at `FINDINGS.md` (§4 holds the operator rulings Q1–Q8); the five
track-*.md files are the evidence; `track5-specs.md` holds every specced
option; `G1-step1-plan.md` / `G1-step2-status.md` are the build's plan and
verification record.

## raw/ — gitignored, regenerable

`raw/` held the session's live API captures, all fetched **2026-08-06**:
the four activated Greenhouse boards (`gh-{grafanalabs,clickhouse,chainguard,
tailscale}.json`, `?content=true`, 446 postings), one Greenhouse per-job
`?questions=true` detail, three Himalayas searches (kubernetes/devops/
backend), one freehire search, one Remotive listing, one Adzuna search.
~8MB, stale the day after capture, so it is gitignored rather than committed.

To regenerate (spends live requests; board content will have drifted, so
regenerated numbers will NOT reproduce the recorded ones exactly — the
recorded counts are the 2026-08-06 truth):

```
mkdir -p research/phase1-eligibility/raw && cd research/phase1-eligibility/raw
for t in grafanalabs clickhouse chainguard tailscale; do
  curl -s -o gh-$t.json "https://boards-api.greenhouse.io/v1/boards/$t/jobs?content=true"
done
for q in kubernetes devops backend; do
  curl -s -o himalayas-$q.json "https://himalayas.app/jobs/api/search?q=$q"
done
```

The scripts that read raw/: `replay-analysis.ts`, `term-counts.ts`,
`verify-g1-replay.ts` (all `npx tsx`, zero network themselves, zero Gemini;
excluded from vitest by filename). `verify-g1-replay.ts` additionally reads
`preferences.json` via `loadBaseline` (read-only) and drove the REAL
`runStage3` — its output matched the live Greenhouse dry-run byte-for-byte,
which is the verification headline recorded in CLAUDE.md's G1 entry.
