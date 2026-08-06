# Track 5 — Implementation specs

**Date:** 2026-08-06. Specs only — no production code was changed this
session. Each spec is Step-1 quality: a build session should be able to
execute it after the operator selects. Current baseline: suite 1030/78,
`PREFERENCES_VERSION = 2`, `maxPerRun = 25`, `ACTIVATED_SOURCES = ["greenhouse"]`.

Naming: **G\*** = geo (Track 1c), **D\*** = duplicates (Track 2e),
**R\*** = role type (Track 3c).

---

## SPEC G1 — Geo eligibility as a scope dimension + per-source mapping + orchestrator filter (Greenhouse-inclusive)

**The full fix.** Amendment B compliant: the persisted dimension is the
OPERATOR'S eligibility, source-agnostic; per-source adapters map onto it.

### 1. What it changes

**(a) Scope dimension (schema v3).** `Preferences.geo`:

```ts
geo: {
  /** ISO-3166 alpha-2, uppercase. The operator's countries of residence/
      work eligibility. Confirmed via setup-scope; [] is NOT valid once
      the section is confirmed (a scope with no eligibility would gate
      everything — reducer refuses `done` on it). */
  eligible_countries: string[];        // e.g. ["IN"]
  /** Whether worldwide/unrestricted-remote postings count as eligible. */
  worldwide_ok: boolean;               // proposed true
  /** Policy for postings whose geo signal cannot be resolved:
      "pass" (keep, surface as geo_unresolved) | "gate" (drop, reported). */
  unresolved: "pass" | "gate";         // proposed "pass"
}
```

Like seniority: proposed as a section in `oaos setup-scope`, all values
explicit, nothing inferred. Country list entered by the operator (the
proposal pre-fills nothing — under-propose; one keystroke to add "IN").
**Membership tests only, never length heuristics** (the Hostaway
148-country-EMEA finding, Track 1d): eligibility = the mapped posting set
intersects `eligible_countries`, OR (worldwide_ok && posting is
explicitly-unrestricted). A 148-country list without India is ineligible;
code must never special-case "long list".

**(b) Per-source geo mapping — new module `src/discovery/geo/`** (new
directory, NOT inside frozen prerank/scope/engine trees):

- `types.ts` — `GeoSignal = { status: "eligible" | "ineligible" |
  "unresolved" | "unknown_source"; countries: string[]; raw: string }`.
  **OPERATOR CORRECTION (Q2 ruling, 2026-08-06): `unknown_source` does NOT
  share the `unresolved` policy flag.** They are different failures —
  `unresolved` means a mapper ran and could not parse; `unknown_source`
  means no mapper exists. `unknown_source` ALWAYS passes, reported
  separately and loudly, independent of the `unresolved` policy. Rationale:
  under `"gate"`, activating any unmapped source would silently gate 100%
  of it, and esoc/nlnet/ghsl are grants/mentorship programs where
  country-of-residence eligibility does not apply as it does to employment.
- `countries.ts` — country-name→ISO vocabulary + aliases (measured set from
  Track 1: "Republic of Ireland", "UK", "USA", "The Netherlands", "Mainland
  China", …) + the small city→country table the ClickHouse census requires
  (~13 cities) + region tokens (EMEA/Europe/APAC/NORAM/LATAM → country-set
  expansion or region marker; a region not containing an eligible country →
  ineligible; region membership table included, curated, closed).
- `map.ts` — `geoOf(sourceName, item: RawItem, geoScope): GeoSignal`,
  dispatching per source:
  - `greenhouse:*` → `raw_payload.location.name` (authoritative) with the
    measured parse set: `"X (Remote)"`, `"Remote (X)"`, `"X - Remote"`,
    `"Hybrid (city, region, country)"`, semicolon multi-value (ANY segment
    eligible ⇒ eligible), bare country, bare city. Unparseable ⇒ unresolved.
    `offices[]` used ONLY as corroboration when location.name is bare-city
    (Track 1b: offices occasionally stale — never overrides location.name).
  - `himalayas` → `locationRestrictions` (empty array ⇒ explicitly
    unrestricted ⇒ eligible iff `worldwide_ok`); membership test on the
    name→ISO vocabulary. `timezoneRestrictions` NEVER used for eligibility
    (Track 1a: tz 5.5 ⊉ India).
  - `freehire` → `countries` (ISO, direct); empty + `regions:["global"]` ⇒
    eligible-if-worldwide_ok; empty + no region ⇒ **unresolved** (NOT
    worldwide — Phase 0's "missing = not resolved").
  - `remotive` → `candidate_required_location` alias-table parse;
    `"Worldwide"` ⇒ explicit unrestricted.
  - `adzuna` → constant `eligible` (India-scoped by URL path) — encoded, not
    parsed.
  - `hn-hiring`, `esoc`, `nlnet`, `ghsl` → `unknown_source` (no reliable
    signal; treated per `unresolved` policy and surfaced separately in the
    summary so the operator sees which sources are unmapped).
- `index.ts`, `tests/`.

**(c) Orchestrator filter — between dedupe and prerank** in `runStage3`
(`src/discovery/orchestrator/orchestrator.ts`): after within-run fingerprint
collapse, partition deduped items via `geoOf`; only eligible+unresolved(pass
policy) items enter prerank. Counts per source (`geo_ineligible`,
`geo_unresolved`) added to `SourceRunSummary` and the run report. Items
gated here are REPORTED, never silent (mirrors prerank's
nothing-dropped-without-a-reason invariant; the invariant lives in the new
module: partitions must sum to input, throw otherwise).

Prerank is NOT touched — it receives a smaller batch. NOTE the composition
consequence (measured, Track 2d): IDF is then computed over the
geo-eligible batch only, which is the correct corpus for relevance anyway.

**(d) CLI** — `cli/commands/stage3.ts`: `loadScope` already returns
`Preferences`; pass `preferences.geo` into `Stage3RunDeps`. Missing geo
section (v2 file) ⇒ handled by the version gate (below), not by a default.

### 2. Diff manifest

| file | reason | frozen? |
|---|---|---|
| `src/discovery/geo/*` (new, ~4 files + tests) | mapping module | no — new |
| `src/discovery/scope/types.ts` | `Preferences.geo`, v3 literal | **FROZEN (scope)** — operator ruling required |
| `src/discovery/scope/geo.ts` (new) | dimension config, proposal builder | new file in frozen dir — ruling |
| `src/discovery/scope/preferences.ts` (loader) | v3 validation (strict), v2 rejection message | **FROZEN** — ruling |
| `src/discovery/scope/reducer.ts` + `setup-scope` CLI | geo section in the interactive loop (`geo add IN`, `geo worldwide on`, `geo unresolved pass`) | **FROZEN** — ruling |
| `src/discovery/scope/baseline.ts` | v2-tolerant baseline carries ticks forward | **FROZEN** — ruling |
| `src/discovery/orchestrator/orchestrator.ts` | filter call between dedupe and prerank | orchestrator (not frozen, but load-bearing) |
| `src/discovery/orchestrator/types.ts` | `Stage3RunDeps.geoScope`, summary fields | same |
| `cli/commands/stage3.ts` | pass geo scope; print geo counts | no |
| `cli/format.ts` | render geo columns in run summary | no |

Zero diff: all 12 engines, pipeline, persistence, `src/discovery/prerank/`
(not one line), Stage-3 frame/sources/adapters, registry, sources.ts.

### 3. Schema/migration impact

`PREFERENCES_VERSION` 2 → **3**. Same trap as the seniority wave, same cure,
verified against the existing split: `loadPreferences`/`parsePreferences`
(consumption) reject v2 with an actionable message; `loadBaseline`/
`parseBaseline` (already version-tolerant, returns `ScopeBaseline` never
`Preferences`) carries v2 ticks + seniority + custom terms forward so
`setup-scope` can open the file it is being run to fix. Exact rejection
message:

```
preferences.json is version 2; this build requires version 3 (adds the geo
eligibility section). Run `oaos setup-scope` to re-confirm your scope —
your confirmed fields and seniority choices will be carried forward and
you will be asked to confirm the new geo section.
```

Behaviour-neutral migration is NOT possible here (unlike seniority's
all-unticked default): an empty `eligible_countries` cannot silently mean
"filter nothing" without making the default a lie. Resolution: the geo
section proposes `unresolved: "pass"`, `worldwide_ok: true`, and an EMPTY
country list, and the reducer refuses `done` while the geo section is
untouched-and-empty **unless** the operator issues an explicit
`geo off` (persisted as `geo: null` — dimension confirmed-absent, filter
disabled, discovery behaves exactly as v2). So the operator must say
something, but "keep the old behaviour" is one command and is persisted as
a decision, not a default.

### 4. D15 compliance

Geo changes what discovery discards unseen ⇒ scope. It rides the existing
unforgeability mechanism unchanged: only `buildPreferences` (confirmed
state) stamps a v3 file; `geo` is part of the reducer state; a hand-edited
geo section fails strict validation naming the path. The filter consumes
`preferences.geo` ONLY via the CLI loader — no default vocabulary, no
fallback (Q2 posture): a v2 file means NO Stage 3 until re-confirmation.

### 5. Test plan

- `src/discovery/geo/tests/countries.test.ts` — alias table, city table,
  region membership, the Hostaway property (148-list without IN ⇒
  ineligible), no length heuristic (property test: eligibility invariant
  under list padding with non-eligible countries).
- `geo/tests/map.test.ts` — per-source fixtures from the measured value
  census (all 4 Greenhouse conventions incl. multi-value + bare city +
  `"(Remote)"` unresolved; Himalayas empty-array worldwide; freehire
  empty-vs-global; Remotive Worldwide; adzuna constant; unknown_source).
  Partition-sum invariant test.
- `orchestrator/tests/orchestrator.test.ts` — filter runs between dedupe
  and prerank (ordering observable via injected fakes); summary counts;
  unresolved pass/gate policies; v3-absent geo (null) ⇒ filter disabled.
- `scope/tests/geo.test.ts` — reducer (add/remove country, worldwide
  toggle, unresolved toggle, `geo off`, refuse-done-on-empty), v2
  rejection message, baseline carry-forward, unforgeability (buildPreferences
  throws unconfirmed).
- Estimated delta: **+60–75 tests, +5 files** → ~1095/83.

### 6. Bounded live verification

Record/replay A/B over one real Greenhouse fetch (4 requests, or reuse
same-day captures): control vs geo-filtered passed sets — expected shape
per Track 2d (324 → 11 eligible-or-unresolved → ~4 passed; all 45 dup
groups dissolve). Plus one Himalayas live dry-run (14 requests) with geo
active: eligible count ≈ 11% of fetched, zero eligible posting gated
(manual inspection of the gated list for any India/worldwide item = the
false-positive check). Total ≤ 18 requests, zero Gemini (dry runs).
Fixtures alone insufficient per #21 — the Greenhouse arm must use real
captured bytes (entity-escaped), not the committed fixture.

### 7. Failure modes

- **Alias/city table miss** ⇒ posting becomes `unresolved`, which under
  `"pass"` reaches prerank (fail-open) — noticed via the geo_unresolved
  count and list in the summary. Under `"gate"` it is dropped but REPORTED.
  The failure is visible either way; the operator picks which direction it
  fails.
- **A board changes location.name conventions** ⇒ unresolved spike in the
  summary — loud, per-source, same detection posture as the HN ratio guard.
- **Structured field wrong (posting says worldwide, field says US)** ⇒ a
  genuinely eligible posting is filtered unseen. Track 1d measured 0/19
  disagreements; residual risk accepted and stated. Mitigation: the
  `questions=true` per-job endpoint as a SPOT-AUDIT tool (evidence
  fallback, ~1 request/posting — never bulk, per Amendment A ruling).
- **Wrong eligible_countries entry** ⇒ operator-confirmed value, visible in
  preferences.json and the setup-scope render.

### 8. Sequencing

Requires: nothing (prerank untouched; works with Greenhouse alone).
Blocks: D-specs (moot-ness check), R2 residual measurement, Himalayas
activation VALUE (activation works without it but yields uneligible-heavy
batches). If `maxPerRun` is ever raised alongside this, re-run #23's
measurement (standing note).

### 9. Assessment

**This is the spec I'd pick**, sequenced first. It is the only option that
fixes the measured 25/25-ineligible condition at the layer where Gemini
budget is spent, source-agnostically, with the operator's eligibility as
confirmed scope. Its cost center is the scope-module changes (v3 +
reducer + migration), which the seniority wave has already rehearsed
end-to-end.

---

## SPEC G2 — Himalayas-only geo filtering (defer Greenhouse mapping)

**Subset of G1** for separate sequencing: same scope dimension (schema v3,
identical migration — do NOT ship a v3 without the full geo section shape,
or v4 follows immediately), same `src/discovery/geo/` module, but `map.ts`
implements ONLY `himalayas` (+ `adzuna` constant + `remotive`, which are
nearly free) and returns `unknown_source` for `greenhouse:*`.

- **Diff manifest:** G1 minus the Greenhouse branch of `map.ts` and its
  tests/fixtures. Everything else identical — the scope/migration cost is
  NOT reduced by deferring Greenhouse.
- **Cost/yield vs G1, stated (the operator's sequencing question):**
  - Build cost saved: the Greenhouse parser (~1 convention set + city
    table) and its tests — the smaller half of the geo module; roughly a
    third of G1's total build. The scope-module work (the expensive,
    ruling-heavy half) is identical.
  - Yield difference: with `unresolved: "pass"`, Greenhouse items ALL pass
    unfiltered — the measured consequence is today's status quo on the
    activated source (25/25 ineligible possible again, 13 dup slots
    included), with Himalayas' eligible items competing against them for
    the 25 slots. With `unresolved: "gate"`, Greenhouse is wholesale
    excluded from discovery — effectively deactivating the only active
    source as a side effect of a policy flag. **Neither is good: G2 only
    makes sense paired with Himalayas activation and the "pass" policy,
    accepted as a transitional state.**
- **Assessment:** G2 is defensible only if the operator wants Himalayas
  activated quickly and Greenhouse's parser reviewed separately. My view:
  the Greenhouse parser is ~150 lines against a measured value census —
  the saving does not justify a transitional state whose Greenhouse
  behaviour is the very condition this session diagnosed.

---

## SPEC G3 — prerank location-gate extension (specced for completeness; NOT recommended)

Extend the frozen prerank module: `PrerankConfig.eligibleCountries` + a new
gate reason `geo_ineligible`, consuming a payload key (`geo_signal`) that
sources/orchestrator must have stamped beforehand.

- **What it changes:** `src/discovery/prerank/{types,config,prerank}.ts`
  (**FROZEN — all three**), plus everything G1's (b)/(c) needs anyway to
  produce the stamped key (the mapping cannot live in prerank: prerank sees
  only text and payload, and per-source parsing inside prerank would import
  source knowledge into a source-agnostic module).
- **Consequence, stated plainly:** G3 = G1 + a frozen-module diff + a new
  payload-stamping seam, for zero additional capability. The gate ordering
  (before scoring, after negative terms) buys nothing over the
  orchestrator site because the geo filter runs on structured fields, not
  text — it has no interaction with IDF beyond batch membership, which the
  orchestrator site already provides.
- **Failure modes:** as G1, plus frozen-module regression surface (the
  invariant, the gate order, 38 prerank tests).
- **Assessment:** exists so the operator sees it was considered. Rejected:
  strictly more cost, no more value.

---

## SPEC S1 — freehire request-side country filter (micro-spec, composable with G1)

Add `countries=in` (+ a paired unfiltered arm? NO — one page per query is
the Wave-5 cap) to freehire's `searchUrlFor` when geo scope is confirmed.
**Honest cost (Track 1a):** response-side mapping (G1) already handles
freehire; the request-side filter changes WHICH 20 rows come back —
recovering eligible rows that today lose the page-1 race to US rows — but
silently drops the unresolved-geo 24% from the page. With G1's mapping in
place the unresolved class is visible when it arrives; with S1 it never
arrives. **Recommendation: measure freehire's post-G1 eligible yield
first; add S1 only if the 20-row pages are measurably wasted on ineligible
rows (1-file change, `sources/freehire.ts` + its test, +3 tests).**

---

## SPEC D1 — duplicates: no fingerprint change (recommended)

Track 2d measured: geo filtering dissolves all 45 regional-variant groups
(none has an India-eligible member; single-country eligibility collapses
sibling groups by construction). **This spec is deliberately empty of
code.** Verification that it stays true: the G1 live-verify A/B includes
the dup-group census (replay script already computes it); if a future run
shows a multi-country-eligible sibling group in the passed set, reopen D2/
D3 with that observation. Suite delta: 0.

## SPEC D2 — strip location tokens from role pre-fingerprint (specced, NOT recommended)

`normalizeRole` (or a pre-fingerprint cleaner in the greenhouse adapter)
drops `| <geo> | Remote` and `- <geo>` title suffixes against the closed
geographic vocabulary from `src/discovery/geo/countries.ts`.

- **Diff:** `src/engines/normalization/fingerprint.ts` (**FROZEN — Engine
  1**) or `adapters/greenhouse.ts` (Wave 3, stable) — adapter-side is the
  honest site (the convention is Greenhouse's, not universal).
- **Migration hazard (the disqualifier):** every persisted record whose
  role contains a strippable token re-fingerprints on the next run —
  update-in-place breaks, Airtable grows duplicates of existing records
  (the 08-04/08-06 records have `| UK | Remote`-style roles). Needs a
  one-time re-fingerprint/merge pass over the table — persistence-layer
  work with its own verification session.
- **Wrong-collapse cost:** two genuinely distinct roles sharing a stripped
  title merge into ONE record forever (merge keeps existing core fields;
  the second role's URL/description are silently lost — Track 2e).
- **Assessment:** cost exceeds benefit while D1 holds. Reopen only on the
  trigger named in D1.

## SPEC D3 — content-hash secondary dedupe (specced, NOT recommended)

Collapse deduped items whose (company, sha1(description)) match; keep one
representative; record sibling locations. Blocked in practice by #19
(`also_seen_in` accumulation is broken — sibling record would be lossy)
and by measured content: Grafana siblings' prose differs by the country
sentence, so the hash DOESN'T match for the highest-count groups. Would
need a geo-sentence-insensitive content normalization — judgment territory.
Assessment: weakest option; recorded for completeness.

---

## SPEC R1 — role type: no gate; rely on Engine 2 + geo side effect (default)

Track 3b: pure sales bottoms out on Match (5); the hazard tier is
sales-engineering (Partner SE T60). Geo filtering removes 4 of today's 5
passed GTM roles (all non-India). Residual measured contamination after a
geo filter on today's corpus: 3 of 4 passed items are India-GTM (Solutions
Architect ×2, Enterprise AE Mumbai) — **note this is 75% of a tiny passed
set; R1 means the operator sees them and ignores them.** Suite delta: 0.
Trigger to escalate to R2: post-G1 runs showing GTM roles persistently
occupying passed slots the operator wanted for engineering.

## SPEC R2 — role-type exclusion as a scope dimension, title-scoped

The durable fix (#23's own naming), shaped exactly like seniority:

- **Scope:** `Preferences.role_types = { excluded: [{id, terms}] }` —
  CLOSED SET config (`account_executive`, `sales_development`, `marketing`,
  `customer_success`, `recruiting`, `solutions_engineering`,
  `partner_engineering`, …), each with persisted expanded terms (the
  seniority ruling: negative unconditional gates persist their terms;
  config may gain, never silently change). Proposed all-unexcluded
  (behaviour-neutral). **Schema: fold into the SAME v3 bump as G1 if built
  together; a separate later bump means v4 and a second re-confirmation —
  sequencing decision for the operator, stated here so it isn't discovered
  mid-build.**
- **Mechanism — the honest cost:** title-scoped matching requires a TITLE
  the gate can see. Prerank receives joined text only (frozen). Site:
  the same orchestrator filter stage as G1 — `titleOf(sourceName, item)`
  per-source lift (greenhouse `raw_payload.title`, himalayas `title`,
  freehire quarantined top-level `title`, hn `liftCompany`-adjacent…),
  then term match against the excluded list ON THE TITLE ONLY. Whole-text
  matching is explicitly rejected (#23's mechanism; "sales team" prose
  must not gate). Same module family as `src/discovery/geo/` — a
  `src/discovery/eligibility/` umbrella housing both filters is the clean
  shape if built together.
- **Diff:** scope files (as G1's manifest), `src/discovery/eligibility/`
  (new), orchestrator call + summary counts, CLI. Prerank untouched.
- **Tests:** ~+40 (config expansion, title lift per source, gate scoping —
  a "mentions sales in body" item must PASS, reducer, migration).
- **Live verification:** replay A/B over the same-day captures: expected —
  the 5 GTM roles gated by title, zero engineering roles gated (inspect
  full gated list); then one live dry-run.
- **Failure modes:** an excluded-term miss passes a GTM role (fail-open,
  visible in results — today's status quo); an over-broad term ("solutions"
  without "engineer") gates real roles — mitigated by title-scoping +
  operator-curated closed set + the gated list being printed.
- **Assessment:** build SECOND or fold into G1's wave as the same
  eligibility stage; do not build before geo — geo removes most of the
  measured contamination and changes the residual you'd tune R2 against.

---

## Cross-spec sequencing (my recommendation, operator rules)

1. **G1** (geo, Greenhouse-inclusive, schema v3) — with R2's schema shape
   decided (in or out of v3) BEFORE the build starts.
2. **Himalayas activation** (Track 4c readiness; pairs with G1 — its 11%
   eligible rate is the first real India yield in query_net).
3. **D1/R1** (no-ops) with their reopen triggers watched in run summaries.
4. **R2** if the post-geo residual justifies it (fold into v3 if the
   operator already knows they want it — avoids a v4).
5. **S1** only on measured page-waste evidence.
