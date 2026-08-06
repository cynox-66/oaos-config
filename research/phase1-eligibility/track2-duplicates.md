# Track 2 — Regional duplicates (P3)

**Date:** 2026-08-06. **Probe requests: 0** — everything here is computed
offline by replaying the Track-1 board payloads (captured the same day as the
2026-08-06 run) through the REAL adapter → normalize → prerank chain
(`research/phase1-eligibility/replay-analysis.ts`; zero network, zero Gemini,
preferences.json read-only via the real loader). **Corpus identity is
established, not assumed:** the replay reproduces the recorded run's numbers
exactly — 446 fetched → 324 deduped (122 within-run dupes) → prerank in 324 →
25 passed.

## 2a. Root cause — named precisely

`computeFingerprint` (`src/engines/normalization/fingerprint.ts:55-62`):
`sha1(normalizeCompany(company) + "|" + normalizeRole(role) + "|" + hostOnly(url))`.

- `role` for Greenhouse items is the posting **title verbatim** (adapter maps
  `job.title`; Engine 1's job_board adapter reads it as role).
- Grafana embeds the country **in the title itself**: `"Backend Engineer -
  Platform - Stacks | Ireland | Remote"`. `normalizeRole` (fingerprint.ts:28)
  lowercases and strips punctuation but keeps the words — `... stacks ireland
  remote` vs `... stacks uk remote` are different strings.
- `hostOnly(url)` is `job-boards.greenhouse.io` for every sibling — no
  differentiation there; the title token alone splits the group.
- ClickHouse/Chainguard reach the same outcome via `"- Canada"` / `"- Benelux"`
  title suffixes. Siblings are genuinely **separate Greenhouse requisitions**
  (distinct `id`, distinct `absolute_url` path) — Greenhouse itself models
  them as N postings.

So the fingerprint is working as specified on its inputs; the inputs encode
one hiring decision as N titles.

## 2b. Scale — measured on the real corpus

Method: group the 324 deduped items by company + title with the
location/region segment stripped (`| X | Remote` suffix; `- <known
region/country>` suffix). Failure modes of this classifier, stated: (i) it
misses variants whose region token isn't in the strip list (e.g. ClickHouse
`"Enterprise Account Executive - Mumbai"` — city, not listed — was NOT
grouped with its siblings, so the numbers below are **lower bounds**); (ii) it
could over-group two genuinely different roles sharing a stripped title — not
observed in the visible groups, all of which show per-country location fields
confirming true siblinghood.

- **Of the 324 deduped items: 145 (45%) sit in 45 regional-variant groups;
  100 of 324 slots (31%) are redundant copies** (members minus one
  representative per group).
- Largest groups: 7× Senior ML Engineer Developer Advocacy (Grafana, CA/DE/
  IE/ES/SE/UK/US), 7× Senior PM Infrastructure Observability, 7× Senior
  Solutions Engineer, 6× Senior SWE k6 Core, 5× each for Pyroscope /
  Synthetic Monitoring / Databases-SRE / Tempo / Alerting / Chainguard
  Enterprise AE, 4× Backend Engineer Platform Stacks.
- **Of the passed 25: 13 slots (52%) sit in 5 variant groups** — 4× Backend
  Engineer Platform Stacks, 3× SWE Platform Productivity, 2× SWE Synthetic
  Monitoring, 2× Staff AI Engineer Grafana AI/ML, 2× ClickHouse Commercial
  AE. (The prompt's 10-of-25 figure was for the seniority-wave run; today's
  control shows 13 — same condition, slightly worse.)

## 2c. Cross-source behavior — the pattern is general, not Greenhouse-specific

**Measured on the Track-1 Himalayas sample (n=56):** Bjak (a remote-first
insurer) appears 8× with per-country postings — "Backend Developer
(Germany)", "(Netherlands)", "(Spain)", "Backend Developer" ×2 with
`locationRestrictions` Philippines / South Korea / US variants — same
one-requisition-per-country publishing pattern, surfaced through an
aggregator. Each carries a distinct title or distinct restriction, so OAOS
fingerprints would keep them distinct exactly as with Grafana.
**Inference** (labeled as such): freehire re-aggregates ATS boards, so it
inherits the same shape; Adzuna is single-country by construction (variants
for other countries never enter); HN posts are one comment per company, so
the pattern is absent there. Conclusion: per-country requisitions are how
remote-first companies publish, board-side; any source that mirrors boards
will show it.

## 2d. Interaction with Track 1 — Amendment C, tested in its new form

**Test:** apply an India-eligibility filter on Greenhouse `location.name`
(country-alias extraction, membership test, unresolved kept) BEFORE prerank,
over the real 324-item corpus; compare passed sets.

**Result — the hypothesis HOLDS, more strongly than stated:**

- Geo filter: 324 → **11** eligible-or-unresolved (8 explicit India, 3
  unresolved: ClickHouse's bare `"(Remote)"` + 2 Tailscale Vancouver-hybrid).
- **None of the 45 variant groups has an India-eligible member.** Every
  group dissolves to zero surviving variants — not to one. Regional
  duplication is not merely reduced; on this corpus it is entirely a
  property of the ineligible slice.
- Geo-filtered prerank: 11 in → 4 passed (7 gated below-floor): Partner
  Solutions Architect - India (ClickHouse), Solutions Architect - India
  (ClickHouse/Bangalore), Enterprise AE - Mumbai (ClickHouse), Sales Dev Rep
  Outbound (Tailscale, unresolved-kept hybrid).
- Structural argument for why this generalizes beyond this corpus: when
  eligibility is a single country, at most ONE variant of any per-country
  sibling group can survive a geo filter — collapse is guaranteed by
  construction. The exception the prompt asked about (worldwide-eligible
  roles ALSO posted per-region) cannot occur on these boards — Amendment A
  found worldwide postings essentially don't exist on company boards
  (1/446 ambiguous bare "(Remote)"). It could occur on Himalayas
  (multi-country lists incl. India, e.g. VEXXHOST's 11-country list) — there
  a duplicate group could survive as ≥2 India-eligible variants, but
  Himalayas variants carry distinct titles/restrictions and low volume of
  such cases (1/56 sampled).

**Consequence, stated plainly: a dedupe fix built before the geo filter is
largely wasted effort on the observed corpus.** 100 excess slots vanish as a
side effect of geo filtering. What a geo filter does NOT fix: nothing in the
observed data — the residual duplicate risk (multi-country-eligible sibling
groups) was not observed in 380 postings examined across two sources.

**The second finding Amendment C surfaced (bigger than P3 itself):** after
geo filtering, the four activated boards yield **~4 preranked
India-eligible items, 3 of them GTM roles, ~0-1 engineering roles**. The
25-item runs of the past week were, for the operator's purposes, ~100%
non-actionable. This quantifies "geo has been the binding constraint" and
feeds Track 4 directly: the fix is not only filtering — it is source mix.

## 2e. Options for treating regional variants as one opportunity

For completeness — noting 2d's conclusion that geo filtering makes most of
this moot on current sources.

**O1 — Do nothing to the fingerprint; let the geo filter dissolve them.**
Cost: zero code, zero wrong-collapse risk. Residual: ineligible variants
still consume within-run dedupe compute (trivial) and, if geo filtering ever
runs AFTER prerank, they'd still eat top-K slots (so sequencing matters:
filter before prerank). Wrong-collapse cost: none. **My assessment: correct
choice today.**

**O2 — Strip location tokens from role before fingerprinting** (extend
`normalizeRole` or add a pre-fingerprint title cleaner). Cost of being
wrong, concretely: `"Site Reliability Engineer - Databases"` vs `"Site
Reliability Engineer - Platform"` must NOT collapse, so the strip list must
be a closed geographic vocabulary — and a miss ("- Mumbai", "- CEUR",
"- NY Metro") silently keeps the dupe while a false hit ("- East" on a
product named East?) silently merges two real roles into one record, which
`writeOpportunity`'s update path then treats as ONE opportunity forever
(second role's URL/description lost — `merge` keeps existing core fields;
the narrowed 2026-08-01 PATCH sends only date+scores, so the surviving
record's Notes never even reflects the second sighting). Changing
`normalizeRole` also **changes every existing fingerprint's input space** —
any already-persisted record whose role contained a strippable token would
re-fingerprint differently on the next run, breaking update-in-place and
creating duplicates in Airtable (the exact opposite of the goal). Frozen
territory (Engine 1). NOT recommended.

**O3 — Secondary content-hash dedupe** (collapse items whose company +
description hash match, keeping one representative + recording the variant
locations in `also_seen_in`). Honest cost: `also_seen_in` accumulation is
broken today (known-issue #19 — fabricated `[]` on every read), so the
variant record would be silently lossy; and description-identical is not
guaranteed across siblings (Grafana's ML Developer Advocacy siblings differ
by one country word in the prose). Touches normalize/persistence — frozen.
Defer until a real multi-country-eligible duplicate group is observed
surviving a geo filter (zero observed to date).

**Interaction notes (per prompt):** `merge` is spec-exact and fabricates
nothing new here; `writeOpportunity`'s narrowed PATCH means collapsed
fingerprints update only scores/date in place. Any fingerprint change is an
Engine-1 change with a table-wide re-fingerprint consequence — it requires a
supervised session and a migration story for the existing 36 records.
