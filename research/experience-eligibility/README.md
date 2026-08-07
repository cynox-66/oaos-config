# experience-eligibility — probe artifacts (2026-08-07)

The probe that asked whether OAOS could filter out postings demanding
professional experience the operator does not have. **Outcome: the branch is
CLOSED — no mechanism ships.** Findings live in `PROBE.md`; the standing
conclusions are in `docs/known-issues.md` #29/#30 and the CLAUDE.md
"EXPERIENCE-LEVEL ELIGIBILITY: PROBED AND CLOSED" entry. This file describes
the harness only.

**Do not read this directory as a spec.** No gate was built. If an
experience-level gate is ever built it must be **response-side** (there is no
request-side mechanism on Himalayas — #29), and it is its own wave with its own
Step 1.

---

## `raw/` — GITIGNORED

Not in the repo. 1.6 MB of verbatim Himalayas API response bodies:

| file | what |
|---|---|
| `sweep-01..13-<term>.json` | one bare `/jobs/api/search?q=<term>` response per enabled scope term, in source order — 212 unique guids |
| `facet-combined.json` | `q=kubernetes` + 7 candidate facet param names at once |
| `facet-isolate-seniority.json` | `q=kubernetes&seniority=Entry-level` — byte-identical to the above, which is what isolated the param |
| `facet-contain-bare-ebpf.json` | `q=ebpf` — the containment control, `totalCount == returned == 1` |
| `facet-contain-facet-ebpf.json` | `q=ebpf&seniority=Entry-level` — `totalCount` 11, intersection with the control **0** |

**Captured 2026-08-07.** 17 live requests total, zero Gemini, zero writes.
`ledger.json` (tracked) records requests 1–13 with URL, status, byte count and
timestamp; requests 14–17 are in `PROBE.md`'s ledger table.

### Regeneration

```
npx tsx research/experience-eligibility/capture.ts     # 13 live requests
```

Requests 14–17 are reproduced individually via `probe-facet.ts` (below).

### ⚠️ Regenerated captures WILL have drifted

A fresh capture is **not** the corpus the findings were measured on:

- Himalayas serves a **fixed top ~20 per query with no pagination**, ranked
  live. Composition changes continuously.
- Postings expire. Specific items named in `PROBE.md` — VEXXHOST *Kubernetes
  Engineer (English)*, Talent Sam *Front-End Developer*, the Odigos *eBPF
  Engineer - Remote* control — may be absent entirely.
- Counts already drifted **227 → 212** between the 2026-08-06 activation run
  and this capture one day later.

So **numeric results in `PROBE.md` are not reproducible by re-running these
scripts**, and a mismatch is drift, not a defect. What IS reproducible is
`probe-facet.ts`'s structural finding — see below.

---

## Scripts

### `probe-facet.ts` — **the durable proof of #29. Run this one.**

Takes a URL and a tag; fetches, saves the body, prints `totalCount`, returned
count, and the seniority mix.

**This is the artifact that matters.** #29 claims something about a **live
endpoint** — that `&seniority=` re-scopes the query rather than filtering it.
Captures cannot prove that: they go stale, and a sceptic is entitled to ask
whether the API changed. `probe-facet.ts` re-verifies the claim against the
live API in two requests, needs no `raw/`, and runs from a clean clone.

**Anyone doubting #29 runs this:**

```
npx tsx research/experience-eligibility/probe-facet.ts \
  "https://himalayas.app/jobs/api/search?q=ebpf" bare
npx tsx research/experience-eligibility/probe-facet.ts \
  "https://himalayas.app/jobs/api/search?q=ebpf&seniority=Entry-level" faceted
```

**#29 holds if `totalCount` is HIGHER on the second call than the first** — a
filter cannot enlarge a match set. That test is robust to drift: it depends on
the relationship between two same-day responses, not on any particular posting.

Use a **rare** term. On a common term (`kubernetes`) there is enough genuine
entry-level inventory to fill the 20-slot page, the results look on-topic, and
the re-scoping is invisible — that is exactly how this probe initially got it
wrong. If `ebpf` ever stops being rare, pick another term whose bare response
satisfies `totalCount == returned`; **`totalCount < 20` does NOT prove
completeness** (`devtools` returns `totalCount` 6 with 4 jobs).

### `backfill-28.ts` — completed migration, **DO NOT RE-RUN**

Ran once, 2026-08-07, backfilling `Company` + `Fingerprint` on the 7 Himalayas
records written before the `companyName` fix (`a78105d`). Those records are
already migrated and verified.

Kept for its **pattern**, not its reproducibility: before trusting a new dedupe
key, re-derive the OLD one through the same real code path with the new key
removed and require byte-identical reproduction of what is stored. All 7
reproduced exactly, proving the reconstruction matched what the original run
actually did.

Re-running is wrong on both counts — its safety gate reproduces *pre-fix*
fingerprints and would correctly refuse against the now-*post-fix* stored
values, and it reads the gitignored `raw/`. The file header says all of this
too.

### `capture.ts` — requires `raw/`, will not run usefully from a clean clone

Wraps the **real** `createHimalayasSource` with a recording `httpGet` and
writes each body to `raw/`. It creates `raw/`, so it runs from a clean clone —
but everything downstream of it needs the captures, and see the drift caveat.

### `analyze.ts` — **requires `raw/`, will NOT run from a clean clone**

Offline replay: rebuilds RawItems from the captures and pushes them through the
**real shipped modules** — `normalize`, the geo mapper, `prerank`, and the real
vocabulary from the operator's confirmed v3 `preferences.json`. Zero requests,
zero Gemini. Produces the §4 composition figures.

Exits on a missing corpus. Run `capture.ts` first, and read the results as a
fresh measurement rather than a reproduction of `PROBE.md`.

**Its prose-minimum extractor is probe-local and imprecise** — it was measured
wrong on ConverseNow (read 1y where the true minimum is 3y, by taking the
lowest match and picking up "at least 1 years in Python"). It is not shipped
code and must not be promoted into any gate without being scored first.

---

## Conventions

All four scripts are excluded from `vitest run` by filename (no `.test.` /
`.spec.`), the standing convention from `live-verify*.ts`, `verify-seniority.ts`
and `verify-g1-replay.ts`. **The default suite stays network-free.**

`preferences.json` is read **only** through the real loader, never written —
D15's unforgeability rule holds here as everywhere.
