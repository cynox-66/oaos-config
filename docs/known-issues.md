# Known Issues

Running list of confirmed defects/limitations flagged for dedicated
review sessions. Do NOT fix these opportunistically — each is scoped to
its own review.

## 1. computeCoverageGap matches topTag against tech_tags[] only, not domains[]

`computeCoverageGap` (src/engines/evidence-matching/match.ts) checks
`topTag` membership against asset `tech_tags` specifically, but `topTag`
is derived from `domain[]` words (per spec, "most frequent domain/tag").
Pure-domain vocabulary words (Security, eBPF, Chaos-Engineering, etc.)
are never present in any asset's `tech_tags` by convention — they only
appear in `domains[]`. Result: any opportunity whose top capability is a
domain-only word will ALWAYS report a coverage_gap, regardless of actual
evidence fit/strength.

Confirmed via real fixture data: "Security" opportunities show
`coverage_gap="Security"` even when a strength-4 asset has fit=0.517.

Needs investigation — likely the check should also match against
`domains[]`, not `tech_tags[]` alone. NOT fixed in this session — flagged
for a dedicated engine-review session. Do not fix opportunistically.

## 3. Reachability under-scored: missing active-channel credit + twitter/blog double-count — RESOLVED

`calculateReachability` (scripts/github-contributor-scan.ts) did not award the
spec §5 "+2 email-equivalent" for an active direct channel (every scanned user
is an active GitHub contributor), and it double-counted twitter and blog as
+1 each instead of a single +1 category. Active maintainers (e.g. Rahul Jadhav)
scored 2 instead of ≥3. RESOLVED: formula corrected to
`1 + 2·(email OR active channel) + 1·(twitter OR blog) + 1·(followers>100)`,
capped 5; caller passes `activeDirectChannel=true`; 6 regression tests added
(scripts/tests/reachability.test.ts). Recomputed and PATCHed 57 of 94 existing
Contacts records to correct values via scripts/fix-reachability.ts.

## 4. runIntake never read persisted Contacts — RESOLVED 2026-07-14

`runIntake` originally passed `manual: []` for contacts, never reading
already-persisted Airtable Contacts by company — so manual intake always
scored contact=0 and recommended Ignore even when reachable contacts
existed. Fixed 2026-07-14: manual intake now resolves existing contacts
by company match before scoring, via `findContactsByCompany` in
src/persistence/read.ts (exact case-insensitive match on the
`Company: <name>` Notes line — the Contacts table has no Company column;
Airtable FIND is only a substring prefilter, the exact-line check happens
in TS so a shorter name never matches a longer one). No live GitHub scan
is triggered; only persisted contacts are read. Regression tests in
src/persistence/tests/persistence.test.ts (4 tests).

## 5. writePipelineResult always creates Contacts records — duplicates on re-intake — RESOLVED 2026-07-14

`writePipelineResult` (src/persistence/write.ts) creates a new Contacts
record for every ranked contact on every run, with no dedupe against
already-persisted Contacts (unlike Opportunities, which are
fingerprint-idempotent and update in place). Re-running intake for a
company whose contacts already exist duplicates them (observed
2026-07-14: 8 duplicate AccuKnox contact records created on the AccuKnox
re-intake; originals keep the `Company:`/`Followers:` Notes lines, dupes
only carry the opportunity record id in Notes, so findContactsByCompany
does not cascade-match the dupes). Needs a dedupe key (e.g. GitHub URL
or Name+company) on contact writes. RESOLVED 2026-07-14: contacts read
back from persistence carry an optional `existing_record_id` through
findContactsByCompany → fromManual → dedupe → Contact; writePipelineResult
skips the create for those and links Outreach to the existing record id.
Only genuinely new discoveries are created. Duplicates deleted; Contacts
back to 95.

## 2. No CLI mode to import an already-scanned contacts file

`runContacts` (cli/commands/contacts.ts) has no mode to import an
already-scanned/pre-formatted contacts file — it always triggers a
fresh GitHub scan and imports whatever `--airtable--` file is newest.
Worked around this session via a throwaway import script
(scripts/import-contact-scan-results.ts) reusing the same
createAirtableClient persistence primitive. Consider adding an
`oaos contacts --import <file>` mode later. Not fixed this session.

## 6. Intake generated no application/outreach packages — RESOLVED 2026-07-15

`runIntake` (cli/commands/intake.ts) called `runPipeline` without
`base_resume`, `operator_profile`, `channel`, or `ask_type`, so Engines 6/7
were always gated off and every intake produced `applicationPackage=null`
and `outreachDraft=null` even for Tier-A "Both" opportunities.
`runPipeline`'s C6/C7 gating (src/pipeline/intake.ts) was already correct —
the gap was purely the caller not supplying inputs. RESOLVED 2026-07-15:
new cli/resume.ts strict loaders (`loadBaseResume`/`loadOperatorProfile`,
throw `ResumeValidationError` with the exact offending path, no coercion)
read the human-placed resume/base_resume.json + resume/operator_profile.json;
`runIntake` now loads both up front and passes them plus a category-derived
channel/ask_type (new pure `defaultOutreachForCategory` + interactive
`collectOutreachChoice` prompt) into `runPipeline`. Verified end-to-end on
AccuKnox (recHvgizujOJzVwWd, Tier A "Both"): both packages now generate,
fabrication_check runs and gates, idempotent update (no duplicate
opportunity/contact). Regression tests: cli/tests/resume.test.ts,
defaultOutreachForCategory cases in cli/tests/intake-mapping.test.ts,
fabrication_check surfaced in src/pipeline/tests/pipeline.test.ts.

The AccuKnox re-run surfaced three DESIGN findings (logged below, NOT fixed
this session — they require a supervised session):

## 7. fabrication_check precision — flags generic connective sentences — RESOLVED 2026-07-16

On the AccuKnox cover letter, fabrication_check returned `flag` with 6
flagged sentences — but all 6 were verified non-fabricated. Several are
generic connective sentences carrying no concrete claim (e.g. "My
experience is defined by two key technical contributions.", "These
experiences demonstrate my ability to navigate complex codebases…"). Even
the substantive #1425 line ("…exception-safe fix… currently pending
review") is correctly honest and traceable to evidence. The check appears
too conservative: it flags sentences with no traceable claim rather than
only flagging unverifiable CONCRETE claims. Needs review — but do NOT
weaken it carelessly: false negatives (letting a real over-claim through)
are worse than false positives here. Design decision, supervised session.
See also #11 — this issue currently throttles the D8 reviewer pass.

RESOLVED 2026-07-16 (supervised session): the grammar-noise failure mode
is eliminated, pinned by tests. Root cause was the soft token rule
counting EVERY unsupported token including English function words
("the", "your", "have"), so ordinary prose flagged on grammar alone.
Replaced by a layered check (see the engine CHANGELOG): Layer 1 = four
pure hard rules (YoE, titles, puffery incl. digit-less experience
claims, narrowed token rule over content tokens only — connective
stopwords excluded, threshold >2, evidence URLs in the allowed corpus);
Layer 2 = one Gemini semantic audit that can only ADD flags (union;
fail-closed to Layer 1 with a visible degradation note on LLM failure).
All six #7 connective sentences now pass; every real-fabrication
regression (YoE, title, invented project, puffery) still flags via the
pure floor with the LLM absent. Validated on the AccuKnox re-run: 6
flagged sentences (incl. pure connectives) → 3, all substantive.
Residual precision limit (true claims in fresh paraphrase vocabulary
still flag via the token rule) is tracked under #11 — it is a different
failure mode than the one this issue logged.

## 8. evidence-match relevance under-ranks the most on-target asset (LOG ONLY)

For the AccuKnox SRE role — AccuKnox owns KubeArmor — the matcher cited
`krkn-rollback-systemexit` + `hyperhid-software-kvm` and buried the actual
KubeArmor contribution at rank #2, uncited in the outreach draft. Honest
strength-scoring (KubeArmor evidence = strength 2, PRs unmerged) combined
with coverage_gap behavior under-ranks the single most company-relevant
asset. Consider a per-opportunity evidence override or strength
recalibration once the KubeArmor PRs merge. Design decision, supervised
session.

## 9. outreach channel vs. contact reachability data (LOG ONLY)

The category default sets `channel=email` for Jobs, but the scanned
AccuKnox contacts carry GitHub handles and no email (email='-'), so the
generated email draft has no deliverable recipient address. Channel
selection should consider which channels the resolved contacts are
actually reachable on, rather than a fixed category default. Related: the
primary contact resolved to the CEO (Rahul Jadhav) over the security
engineer (Prateek Nandle) via seniority preference, which may be
suboptimal for a referral ask. Design decision, supervised session.

## 10. Generic cover letter on first real run — ADDRESSED 2026-07-16 by D8

The first real C6 run (AccuKnox) produced a generic cover letter: no
company-specific insight, single-pass draft with no critic (finding
logged in the research doc, DISCOVERY-SYNTHESIS-DECISIONS.md, decision
D8). ADDRESSED by the D8 drafter-reviewer pass
(src/engines/application-package/critic.ts): one extra Gemini critique
call returns structured sharpen-only edits (never-add-facts contract),
applied via pure exact-string replacement, and the revised letter re-runs
the existing pure fabrication trace-check — critic for quality, regex for
truth. Validated on AccuKnox before/after: the letter is now more
specific. Caveat: see #11 — critic edits can still be discarded when
regen fires on token-rule flags (#7's grammar-noise trigger is resolved;
the paraphrase-vocabulary trigger remains).

## 11. D8 critic edits discarded when the regen path fires — RESOLVED 2026-07-18

D8 critic edits are discarded when the regeneration path fires, and under
known-issue #7's current conservatism (fabrication_check flags generic
connective sentences carrying no concrete claim) the regen path fires on
most real runs — so D8 is currently throttled by #7: the critic's
sharpened letter is thrown away and replaced by a fresh single-pass
regeneration. Two candidate remedies, BOTH deferred, BOTH requiring a
supervised session:

(a) improve #7's precision so it stops flagging generic connectives with
    no concrete claim; or
(b) reorder so regeneration fires only on hard-rule flags, NOT on soft
    connective flags. Remedy (b) touches the safety path's control flow
    and must NOT be done unsupervised.

Cross-reference: issue #7 (fabrication_check precision).

UPDATE 2026-07-16: remedy (a) is done (#7 RESOLVED — grammar noise no
longer triggers regen). IMPROVED but not cleared: D8 edits still die
when the narrowed token rule flags true-but-paraphrased sentences —
observed on the AccuKnox re-run, where the critic applied 4 sharpening
edits and regen then discarded them (criticEditsApplied=0) because three
evidence-traceable sentences used vocabulary outside the corpus
(e.g. "equipped", "robust", "maintainable"). Token-overlap rules cannot
recognize honest paraphrase; deliberately NOT patched by stoplisting
professional vocabulary (claim-bearing words stay counted, fail-closed).

Sharpened design question for the supervised session: should regen fire
only on hard-claim flags (YoE/title/puffery), with token-rule flags
serving as human-review signals that do not trigger regen? Leading
candidate design as of this session. Cross-reference #12 (approval
surface): token-flags-as-review-signals only works once a reviewer
actually sees flags.

RESOLVED 2026-07-18 (supervised session): regen routing fixed. Final
rule: regeneration fires on nets 1/2/3/5 (YoE / title / puffery /
semantic audit) — never on net 4 (token rule) alone. Net-4-only flags
are retained as `review_only_sentences` (FabricationResult +
ApplicationPackage), still set `fabrication_check="flag"`, and surface
at the #12a CLI acknowledgment gate; net 4 co-occurring with a hard net
never blocks a regen that net earned. Detection predicates for all five
nets are byte-for-byte unchanged — this is routing only. The regen
decision is `requiresRegen()` (fabrication.ts), an explicit
set-difference (any flagged sentence outside the review-only set), not
length arithmetic. A sentence net 5 names is promoted out of
review-only; a degraded net 5 adds no flags (deliberate: Q2 Option A,
safe because degradation renders inside the same CLI flag block).
Test-pinned with synthetic generalization fixtures (true paraphrase →
net 4 alone, no regen; paraphrase + puffery → regen via net 3), not
just the single AccuKnox observation — per-net routing, promotion,
degradation, and edit-survival tests across fabrication/semantic/
package suites (405 → 438). Proven live on the AccuKnox re-run: 3
net-4-only flags, NO regen call in the Gemini sequence, letter passed
through intact. One caveat: live confirmation of edit-survival
specifically is currently masked by #13 (anchoring skips edits before
survival is testable on this letter); edit-survival-through-no-regen is
pinned by package.test.ts where edits do apply. We observed regen not
fire — which is the fix — not edits surviving live.

## 12. Package contents never reach a human approval surface — #12a SHIPPED 2026-07-18; #12b deferred (LOG ONLY)

Application/outreach package contents (letter, fabrication flags,
degradation warnings, notes) are not persisted by writePipelineResult and
not displayed by the intake CLI — the human approval gate currently has
no systematic surface and depends on ad-hoc inspection of pipeline
results. This is a gap in the human-gate guarantee: spec §6 requires
`fabrication_check=pass` before a package is eligible for human review,
but nothing systematically presents the package (or its warnings, e.g.
the semantic-layer degradation note) to the human at decision time. Fix
requires cli/ + persistence work; deferred to a supervised session.

UPDATE 2026-07-18: #12a (CLI acknowledgment gate) shipped alongside the
#11 fix. `oaos intake` now prints the application package's fabrication
flags before the Airtable write — hard flags and review-only (net-4-only)
flags in visually distinct sections of one block, with the
semantic-degradation state rendered inside that same block — and, iff
review-only flags exist, blocks on an explicit y/n confirmation
(`acknowledgeReviewFlags`, cli/commands/intake.ts; pure renderer
`formatPackageFlags`, cli/format.ts). "y" proceeds; "n" aborts before
writePipelineResult with "Intake aborted — nothing written." (clean exit
0 — an operator choice, not an error); no review-only flags → no prompt.
Unit-tested with fake prompter + captured log (cli/tests/ack-gate.test.ts,
format.test.ts); verified live on the AccuKnox re-run. The full persisted
review surface (#12b — persistence of letter/flags/notes, a
machine-readable approved flag) remains explicitly deferred, to be built
alongside C9 (approval-based auto-execution), which is when a
machine-readable "approved" flag actually becomes necessary.

## 13. D8 critic edit anchors are not reliably verbatim — valid edits silently skipped (LOG ONLY)

D8 critic structured-edit `old` strings are not reliably verbatim
against the draft, so applyEdits' exact-match guard silently skips
valid edits (observed live on AccuKnox 2026-07-18: 4 sensible edits, 0
applied, all skipped on non-verbatim anchors — e.g. the critic quoted
"Dear Hiring Team at AccuKnox, I am writing…" where the draft reads
"Dear Hiring Team, I am writing… at AccuKnox"). This is a correctness
limitation in D8's edit protocol: the critic paraphrases the text it
quotes instead of copying it verbatim, despite the prompt's
copied-verbatim contract. Near-determinism made it reproduce
byte-identically across runs on THIS letter, but the root cause is the
anchoring failure, which will fire intermittently across different
letters. It fails safe — the unmodified draft proceeds and is still
fabrication-checked — but its effect is that D8's entire value can
silently evaporate on a given letter, with only `criticEditsApplied: 0`
as signal. Currently masks live confirmation of #11's edit-survival
payoff. Needs a supervised session (candidate directions: fuzzy/
normalized anchoring, sentence-index anchoring, or a retry-with-
verbatim-reminder — all touch the D8 protocol and must not be done
opportunistically). Do NOT fix outside a dedicated session.

## 14. Engine 1's completeness formula ignores description presence — content-less items pass as complete (LOG ONLY)

`computeCompleteness` (src/engines/normalization/normalize.ts) scores
`present_core_fields / 6` over `{company, role, category, domain≥1, url,
comp_basis≠unknown}`. **The description is not one of the six.** So an item
with a company, a role, a url and a category — but NO description text at
all — scores 4/6 = 0.67, far above the 0.4 `ENRICHMENT_THRESHOLD`, and comes
out `needs_enrichment: false`. An empty description only costs a point
indirectly, when it happens to starve `deriveDomains` of matches.

Consequence: `needs_enrichment` cannot be used as a "this item has no usable
content" signal, and a source CANNOT mark its items as content-poor — `RawItem`
has five fields and none of them is a flag, and `needs_enrichment` is computed,
not settable.

Discovered during Wave 5 (2026-07-28) while looking for the mechanism to mark
Adzuna's 500-char-truncated descriptions. It affects more than Adzuna:

- **The Greenhouse fallback rationale was wrong.** Wave 3's `greenhouse.ts`
  falls back to the plain listing on non-200 and returns description-less items
  silently, documented as safe because "Engine 1 flags them `needs_enrichment`
  and the existing research/enrichment step fills the description." It does
  not — those items score 4/6 and pass as complete. The CLAUDE.md line stating
  otherwise was corrected 2026-07-28; the code is unchanged and still fails
  safe (the items carry `url`), but the stated mechanism does not exist.
- Wave 5 worked around it rather than changing Engine 1 (frozen): the content
  quarantine (`query/truncation.ts`) makes truncated text structurally
  unreachable as a description instead of relying on a flag.

Candidate fix for a dedicated session: add description presence to the
completeness formula. NOT safe to do opportunistically — `completeness` feeds
`needs_enrichment`, which gates the research/enrichment path, and changing the
denominator or the field set shifts every existing record's score. Do NOT fix
outside a supervised session.

---

## 15. Gemini client has no request timeout — a hung socket can stall a run (LOG ONLY)

`createGeminiClient` (src/engines/scoring/gemini.ts) calls `fetch` with no
`AbortSignal` and no deadline. The Wave-9 throttle added a retry budget
(`GEMINI_RETRY_BUDGET_MS`), but that bounds **backoff sleep**, not a connection
that accepts and then never answers. A stalled socket hangs the call, and with
it the run, indefinitely.

Pre-existing — the client never had a timeout. Recorded here because the
throttle makes it slightly more consequential than it was:

- **Before:** the pipeline fired calls without pacing, so a hung call stalled
  only the one opportunity awaiting it; other calls were already in flight.
- **After:** calls are serialized through one paced queue. A hung call holds
  the queue, so everything behind it waits too. The blast radius grew from one
  opportunity to the rest of the run.

Not urgent — no hang has been observed against `generativelanguage.googleapis.com`
in any run to date, and Node's default socket behavior eventually errors on a
dead connection. But the interaction between "no timeout" and "one shared
queue" is the part worth remembering.

Candidate fix for a dedicated session: an `AbortSignal.timeout(ms)` on the
fetch, surfaced as `GEMINI_REQUEST_TIMEOUT_MS`, throwing an error that the
throttle treats as non-429 (no retry) so the existing degradation path handles
it unchanged. Small and self-contained — but it changes what a caller can see
thrown, so it wants its own verification pass rather than a drive-by.

---

## 16. company_board healthCheck re-fetches the whole registry — a run costs 2× its item count in HTTP (DOCUMENTED COST CHARACTERISTIC — not a defect)

`createCompanyBoardSource`'s `healthCheck` calls `fetchRegistry(adapter, registry, deps)`
a second time (src/discovery/stage3/company-board.ts:76-108, the same helper
`fetch` uses at :36-53). The orchestrator calls both per source per run —
`source.fetch(sourceDeps)` and then `safeHealthCheck(source, sourceDeps)` — so
**every company_board run performs two complete fetches of every enabled
registry entry.**

**This is not a bug and is not filed for fixing.** The family-level healthCheck
semantics are the delta-5 operator ruling (`ok:false` only when every enabled
entry failed, partial failure named in `detail`), and an INDEPENDENT probe
rather than a cached replay of the fetch result is arguably the point of it: a
health signal derived from the same bytes as the fetch would not be a second
observation. Recorded so the cost is known, not so it is removed.

**Evidence it really is two fetches.** After the 2026-07-30 Greenhouse run,
`discovery/health.json` recorded `"all 4 entries healthy, 419 items"` while the
run summary reported `fetched 419`. Those are two independently-produced counts
from two separate traversals that happened to agree — not one number copied
twice.

**The scaling rule:** a company_board run costs **2× the HTTP volume implied by
its item count**, and that doubling scales with the number of enabled registry
entries, not with items retrieved.

**The cost is NOT uniform across platforms** — this is the part that matters
later. It depends on requests-per-entry, which differs by adapter:

- **Greenhouse** is one request per board (plus a second only if `content=true`
  falls back). 4 enabled boards → 4 requests per traversal → **8 per run**.
- **Workday CXS** paginates at `PAGE_LIMIT = 20` (src/discovery/stage3/adapters/workday.ts:9).
  Red Hat's ~228 postings are `ceil(228/20)` = **12 requests** per traversal →
  **~24 per run**, for a single registry entry.

So one Workday entry can cost roughly three times what all four Greenhouse
boards cost together, and the doubling multiplies whichever it is.

**Why nothing currently catches this.** Engine 11's admission checks budget
`maintenance_minutes_per_week` — human upkeep — not HTTP volume. There is no
admission check that counts requests, so a source can pass admission cleanly
while costing double what its `est_volume_per_week` suggests. The Stage-3 run
summary likewise reports items, never requests.

**When it stops being trivia:** Wave 7 registry expansion. At today's 8 entries
(4 of them behind a single activated source) the absolute numbers are small.
Adding paginating entries — Workday tenants especially — multiplies against the
2× rather than adding to it, and no existing check would surface that before a
run.

---

## 17. Evidence links are never persisted — deferred to C9 (LOG ONLY)

`writePipelineResult` (src/persistence/write.ts:65-88) writes the Opportunity,
then every ranked Contact, then the Outreach draft — no evidence-link write
exists in that function, or anywhere else in `src/persistence/`. `evidenceFields`
does not exist (no such symbol anywhere in `src/` or `cli/`).
`FIELD_NAMES.opportunities.evidence_assets` (src/persistence/config.ts:35,
`"Evidence Assets"`) and `TABLE_NAMES.evidence` (src/persistence/config.ts:11,
same string) are declared and never referenced by any write or read function.

This is the evidence-side instance of the #12b class: engine output correct in
memory (Engine 3's `EvidenceMatch` reaches Engine 2 in full — see the
`inputs_hash`/runPipeline ordering established during the 2026-07-30/31
diagnosis), never persisted, never reaches a review surface. Same deferral
ruling as #12b: deferred to C9.

**Does not affect scores or tiers.** `computeScore` (src/engines/scoring/
score.ts) reads `evidence_match` as an in-memory `ScoreRequest` field, passed
directly from `runPipeline` (src/pipeline/intake.ts:63,71) — never from the
Airtable link column. Persisting evidence links moves no score and no tier.

The Airtable Evidence Assets table currently holds 7 of the inventory's 21
assets, and no inventory-id → Airtable-record-id resolver exists yet — building
one is part of what C9 would need to do.

---

## 18. `inputs_hash` is computed and stored but never consumed (DOCUMENTED DORMANCY — not a defect)

`computeInputsHash` (src/engines/scoring/score.ts:79-90) feeds the
skip-if-unchanged branch at score.ts:316 (`if (options.previous &&
options.previous.inputs_hash === inputsHash) return options.previous;`). Both
production call sites omit `options.previous` — `src/pipeline/intake.ts:66-74`
and `cli/commands/score.ts:68-71` — confirmed by grep across `src/` and `cli/`
for `previous:`, matching only an unrelated field on
`src/discovery/orchestrator/orchestrator.ts`. So the branch never fires in
production; every score is recomputed on every run, LLM call included.

Not a defect — nothing is broken by this, and the upside is real: because the
branch never fires, there is no stored-hash invalidation risk for any future
change to what feeds `computeInputsHash`. A hash that's never compared against
can never go stale in a way that silently returns a wrong cached score.

---

## 19. `also_seen_in` is not maintained on the Opportunities update path (LOG ONLY, related to #17/#18's class)

Fixed this session (2026-07-31): `writeOpportunity`'s update-path PATCH no
longer regenerates the whole `Notes` field from a lossy `merge`d object (see
the CLAUDE.md "re-runs are self-healing" correction). The narrowed PATCH
(`opportunityUpdateFields`, src/persistence/records.ts) sends only
`Date Found` + `Quality Score` + `Match Score` — `also_seen_in` is deliberately
NOT included, and this entry documents why, so a future session doesn't try to
add it back in without reading this first.

**Mechanism (a):** `also_seen_in` has no dedicated Airtable column —
`FIELD_NAMES.opportunities` (src/persistence/config.ts:16-34) has no such key.
It exists only as a line inside the single composite `Notes` text field,
rendered by `opportunityNotes` (src/persistence/records.ts:24-36) alongside
Description/Comp/Remote/Location/Completeness/Needs-enrichment. Airtable PATCHes
a text field as a whole value — there is no partial-line update. So writing
`also_seen_in` is structurally inseparable from rewriting every other
Notes-embedded field, which is exactly the fabricated-blank overwrite this
session's fix exists to stop.

**Mechanism (b):** even if Notes could be surgically patched, the accumulation
would still be broken at its root. `merge` (src/engines/normalization/
normalize.ts:128-141) builds `alsoSeenIn` by appending onto
`existing.also_seen_in` — and `existing` comes from `parseOpportunity`, which
FABRICATES `also_seen_in: []` on every read regardless of what's actually
stored (src/persistence/records.ts:70-97). So the accumulated list already
resets to at most one entry on every run, independent of anything this session
touched.

**Why not fixed here:** a fix would mean either (i) reading raw Notes text back
out and re-implementing `merge`'s accumulation logic as string manipulation in
the persistence layer — a second mechanism for the same logic, invented to work
around a lossy round-trip, or (ii) fixing `parseOpportunity`'s round-trip
itself — both are design decisions for the eventual proper fix, not a defect
patch. Operator ruling, 2026-07-31: log it, don't fold it into this session's
narrower PATCH-scope fix.

**Why it doesn't matter yet:** `also_seen_in` tracks multi-source sightings, and
Greenhouse is currently the only enabled source (`ACTIVATED_SOURCES`,
src/discovery/orchestrator/sources.ts). There is no second source for anything
to be "also seen in" until Wave 8 activates one.

---

## 20. Prerank scoring is presence-based — a duplicated payload value cannot inflate a score (DOCUMENTED — not a defect, recorded for future source authors)

Discovered while evaluating the Greenhouse `content`→`description` mapping
(2-A, 2026-07-31): adding a `description` key holding the same text as the
existing `content` key means that text appears twice in the same item's
`raw_payload`. `collectStrings` (src/discovery/prerank/text.ts:23-38) does not
dedupe — every string leaf it walks is pushed into the joined text regardless
of whether an identical string was already pushed.

**But this has no effect on the score, and the reason is structural, not
coincidental.** `termPresent` (src/discovery/prerank/text.ts:74-78) is a single
boolean `.test()` — whether a term occurs *at all* in a text, never how many
times. `matchedTerms` (text.ts:82-92) calls `termPresent` once per distinct
vocabulary term and dedupes the term list itself. In `prerank()`
(src/discovery/prerank/prerank.ts): document frequency is `termPresent` once
per *item* (a term occurring twice within one item's text still only
increments df by at most 1), and per-item scoring sums IDF weight over
`matchedTerms`, again presence not count. A term appearing once in an item's
text and the same term appearing twice are indistinguishable to every stage of
this pipeline.

Empirically confirmed against the real Greenhouse fixture
(src/discovery/stage3/tests/fixtures/greenhouse/jobs.json): prerank scores for
both fixture jobs were measured byte-identical (0.8 and 0.2) with and without
the `content`/`description` duplication, using a temporary, uncommitted
measurement script (not part of the suite — the finding above is what earned a
permanent place, not a numeric regression test, since the answer is now
structural rather than fixture-specific).

**For the next person adding a payload key:** you do not need to worry about
double-counting a value that already exists elsewhere in the same item's
`raw_payload` under a different key — prerank cannot see the difference between
one occurrence and several. This does NOT extend to values that differ across
items (e.g., inflating apparent *document frequency* by duplicating a term into
an item that otherwise wouldn't contain it) — that changes what a term's
presence means for that one item, which is a different question this entry
does not answer.

---

## 21. The committed Greenhouse fixture is not entity-escaped — the real API is (RESOLVED 2026-07-31, standing caveat on every fixture-based test)

Found by the bounded live probe for 2-A (2026-07-31), against the real
Greenhouse API for two currently-activated companies (`grafanalabs`: 142/142
postings; `chainguard`: 70/70 postings — zero literal, zero mixed, in both).
Real Greenhouse `content` is HTML-**entity-escaped**
(`&lt;div class=&quot;content-intro&quot;&gt;...`), never literal `<div>...`.
`src/discovery/stage3/tests/fixtures/greenhouse/jobs.json` — the committed,
previously live-verified fixture used by every Greenhouse test — uses plain
**literal** HTML (`<p>...</p>`). This divergence is exactly why the seam test
(`greenhouse-normalize-seam.test.ts`) passed against the fixture while the real
fetch, run through the same code, did not: the fixture cannot exercise a code
path the real API's encoding actually takes.

**This was previously a latent defect, invisible before this session.** Before
2-A, Greenhouse's `content` was never read as a description at all (it isn't
one of Engine 1's recognized keys), so `stripHtml`'s entity-vs-tag ordering bug
(see the `stripHtml` fix, `src/engines/normalization/text.ts`, same date) never
ran on Greenhouse data in production. 2-A made `content` reachable for the
first time, which is what surfaced it.

**Blast radius beyond Greenhouse, checked not assumed:** every fixture file
under `src/discovery/stage3/tests/fixtures/` (greenhouse, workday, lever, esoc,
cncf-lfx, ashby, lfdt) was grepped for entity markers (`&lt;`, `&gt;`, `&quot;`,
`&amp;`) — none contain any. Wave 5 sources keep their sample payloads inline in
their `.test.ts` files rather than separate fixtures; the one with literal HTML
in its sample (`himalayas.test.ts`) also uses plain `<div>...` tags, not
escaped ones. So **no fixture or inline test sample anywhere in the repo
currently exercises entity-escaped content** — this class of divergence between
committed test data and live reality is not unique to Greenhouse, it is simply
the first place it was checked.

**Concretely, today:** only Greenhouse (activated) is affected in production.
Himalayas is not activated (`ACTIVATED_SOURCES = ["greenhouse"]`,
`src/discovery/orchestrator/tests/sources.test.ts`), but its description
reaches `cleanDescription` directly (unlike Adzuna/freehire, whose content is
quarantined under `description_truncated` — a key `job_board.ts`'s read list
does not check, so quarantined content does not reach this path today). If
Himalayas is ever activated, or the Wave 5 quarantine is ever lifted, whether
this specific defect recurs depends on whether that source's real API also
entity-escapes its HTML — not verified here, since neither is activated and
checking would have gone beyond this session's bounded, one-real-GET
verification scope.

**Not fixed by editing the fixture.** Per operator ruling: the fixture stays
pristine — a real captured snapshot that differs from current reality is itself
information, not something to paper over by making the fixture agree with
after-the-fact findings.

## 22. `description_norm` is capped at ~1000 characters in Notes rendering (DOCUMENTED COST/BEHAVIOUR CHARACTERISTIC — not a defect)

Every one of the 25 records from the 2026-08-04 Greenhouse verification run
(see the CLAUDE.md "WAVE 8" entry for that date) has a `description_norm` of
999–1000 chars in the persisted `Notes` field — a truncation boundary, not a
coincidence.

**Located, read-only, not modified:** `opportunityNotes()` in
`src/persistence/records.ts:27` —
`o.description_norm ? \`Description: ${o.description_norm.slice(0, 1000)}\` : ""`.
This is a **persistence-write-path** cap on what goes into the Airtable Notes
field, distinct from Engine 1's own cap: `MAX_DESCRIPTION_CHARS = 5000` in
`src/engines/normalization/text.ts:9`, applied to `description_raw` via
`.slice(0, MAX_DESCRIPTION_CHARS)` (text.ts:61). The 5000-char cap is far
above what any observed Greenhouse posting reaches, so it is not what's
truncating these records — the 1000-char slice in `records.ts` is.

Not changed. Current behaviour produces good scoring results (Engine 2 reads
`description_norm` directly from the in-memory pipeline output, not from the
truncated Notes field — the 1000-char cap only affects what a human sees in
Airtable, not what gets scored). Recorded so nobody later wonders why longer
postings don't visibly differ in Notes.

---

## 23. Prerank negative-term matching is whole-text, not title-scoped (LOG ONLY — measured harmless at k=25, see the V3 outcome below)

The seniority dimension (Wave: Seniority, 2026-08-06) is the first feature to
put anything into `PrerankVocabulary.negativeTerms` — it was `[]` from Wave 0
until now. That list is consumed at exactly one place,
`src/discovery/prerank/prerank.ts:102`:

```ts
if (vocabulary.negativeTerms.some((term) => termPresent(text, term))) {
  preScoreGated.push({ item, reason: "negative_term", score: null });
```

Two properties of that line make the gate blunter than it looks:

1. `text` is `extractText(item)` — **every string leaf of the item's payload to
   depth 6, including the full description body**. It is not the title. A
   posting that merely *mentions* a level ("you'll partner with senior
   engineers", "reports to the Engineering Manager") is gated exactly as
   readily as one that *is* that level.
2. It is the second hard gate, evaluated **before** scoring. There is no
   relevance floor and no top-K to recover from — a hit is unconditional.

**Measured, 2026-08-06, live against the four activated Greenhouse boards** (V1
and V3 of the seniority wave; all five levels excluded, corpus 445 fetched →
323 deduped):

- 171 of 323 items (53%) were gated `negative_term`; `senior` alone decided 145
  of the 171 (85%).
- Mechanically, 130 of the 171 carried the deciding term in the TITLE and 41 in
  the body only. See #24 for why 41 is an upper bound, not a false-positive count.
- Six items were plausible non-senior engineering roles gated on body prose
  alone: Chainguard *Security Engineer*, ClickHouse *QA Engineer - Core
  Database*, ClickHouse *Support Engineer - China*, Tailscale *Customer
  Reliability Engineer*, Tailscale *Customer Support Engineer*, Tailscale
  *Software Engineer, Strategic Projects*.

**THE V3 OUTCOME — why this stays logged and was not fixed.** Only **17 of the
171** gated items were in the control run's passed 25; the other 154 sat in the
`beyond_k` / `below_floor` tail and would have been dropped anyway. All 17 were
genuine Senior / Staff / Engineering-Manager / Senior-PM titles — **zero false
positives in the visible set**, and none of the six body-prose cases above was
among them. At `maxPerRun: 25` the hazard cost nothing a human would have seen.
Operator ruling 2026-08-06: **A1 ships as built.**

**This measurement is scoped to `maxPerRun: 25`.** The 154 sit in the tail
*because k is small*. A larger budget exposes more of them, the six included.
If `maxPerRun` ever changes, re-run this measurement before trusting the gate
at the new k.

### RE-MEASURED 2026-08-06 AT THE POST-G1 REGIME — THE RULING ABOVE IS FALSIFIED HERE

The V3 ruling ("correct at k=25 — 17 of 171 in the visible set, zero false
positives") was **explicitly scoped to the pre-G1 regime**, where `maxPerRun`
bound and the gated items sat in the `beyond_k` tail. The G1 geo filter removed
that regime: the batch reaching prerank is now ~30 items, not ~324, so
`maxPerRun` does not bind (`beyond_k: 0`) and **there is no tail for a bad gate
to hide in**. Every seniority gate is now a directly visible loss.

**Measured on the first two-source run (2026-08-06, Wave 8 — greenhouse +
himalayas, 30 geo-eligible items into prerank, 18 gated `negative_term`):**

- **10 of the 18 have NO shipped seniority term in their title** — they were
  gated on body prose alone. This is the exact "any shipped term anywhere in
  the title" count that #24 records as never having been taken; it is a cleaner
  measurement than #24's deciding-term upper bound.
- The 8 title-matched gates are correct (Senior/Principal/Engineering-Manager
  titles).
- Among the 10 body-only gates are plausibly on-target roles, most starkly
  **`Kubernetes Infrastructure Engineer`** — India-eligible, title entirely
  clean, deleted before scoring. Also: `Infrastructure and Security Engineer`,
  `Global Security Operations Engineer`, `Web Frontend Engineer - JS, CSS,
  React, Flutter`, `Data Operations`.

**Status: the hazard is CONFIRMED, and the V3 ruling no longer covers the
regime OAOS actually runs in.** The remedy is the title-scoped negative gate
named above, which lives inside frozen `src/discovery/prerank/` and requires an
operator ruling. **It was NOT built, and no term list was shortened** —
operator ruling 2026-08-06, restated: log the measurement, do not act on it.
Shrinking a term list to improve a number is the failure mode the wave's
verification exists to prevent.

**The durable fix, if it is ever needed, is a title-scoped negative gate.** That
lives inside `src/discovery/prerank/`, which is frozen, and would require an
operator ruling. Do not attempt to compensate by shortening the term lists —
tuning a term list to improve a measurement is the failure mode the wave's
verification existed to prevent.

Related: hyphenated title forms are not covered, because `-` is a boundary
character to `termPresent` — `"staff engineer"` does not match `staff-engineer`.
Recorded, not worked around.

---

## 24. No `tsconfig.json` — type errors are structurally invisible to the suite (LOG ONLY)

The repo runs `tsx` directly and `vitest` transpiles without typechecking, so
nothing in `npm test` ever evaluates a type. A type error is not a failing
test; it is nothing at all.

Found concretely during the seniority wave: `src/discovery/stage3/tests/
query-helpers.ts` had `origin: "vocabulary"` on its `ScopeField` fixture, but
`FieldOrigin` is `"derived" | "operator_added"`. That literal was invalid from
the day it was written (Wave 5) and the suite stayed green through every run
since. Corrected to `"derived"` in this wave, in a file already being edited.

Same class of blind spot as #21: the suite cannot see a category of defect, so
"890 green" / "1030 green" is not evidence about it either way. **No typecheck
gate was added this wave** — operator ruling. Recorded so the next session
knows the guarantee the suite does and does not provide.

**A second measurement artifact of the same family, recorded here rather than
in #23 because it is about the classifier, not the gate.** The title-vs-body
attribution in `scripts/verify-seniority.ts` tests the **deciding** term — the
first match in vocabulary order — and `senior` sorts first. So an item whose
title carries a later-sorting shipped term still gets classified "body only"
when `senior` also appears in its body:

- Grafana *Staff Software Engineer – Identity and Access* ×3 → deciding term
  `senior`, though the title contains `staff software engineer`.
- ClickHouse *Principal Software Engineer - Postgres` → same.
- Chainguard *Sr. Product Marketing Manager* → title contains `sr.`.

**41 body-only is therefore an UPPER BOUND on title-clean items, not a
false-positive count.** By inspection ~14 of the 41 are this artifact. An exact
"any shipped term anywhere in the title" count was not taken.

---

## 25. Non-engineering roles float into the visible set when engineering roles are removed from the top of the batch (LOG ONLY — SECOND SIGHTING)

Prerank's vocabulary has **no engineering-vs-GTM discrimination**. Sales,
marketing and customer-success postings at infrastructure companies share the
domain terms that drive the score — *platform*, *cloud*, *customer*,
*solutions*, *security*, *observability* — so they compete for top-K slots on
the same footing as engineering roles.

**Sighting 2 (2026-08-06, seniority wave V3).** With the seniority exclusions
active, three clearly non-engineering roles were promoted into the passed 25
that were not there under the control:

- ClickHouse — *Commercial Account Executive*
- ClickHouse — *Commercial Account Executive - Canada*
- Chainguard — *Field Marketing Manager - CEUR*

They did not become more relevant. Senior engineering roles were removed from
above them and they floated up. This is a direct, expected consequence of A1
being **compositional** (see the CLAUDE.md wave entry): the 25 slots are
reallocated, and whatever ranks next takes the slot regardless of its kind.

**Sighting 1 (2026-07-30, Wave 8) — cross-referenced deliberately.** A
Chainguard *"Senior Partner Sales Engineer - Brazil"* scored 39 on quality and
reached the top 25. That was tracked as a watch item and **closed 2026-08-04**
when the role vanished from the table after the Greenhouse field-mapping and
`stripHtml` fixes landed: with real descriptions in play, genuine engineering
roles outscored it. **That closure was correct for its stated cause and is
incomplete as a general finding.** The cause was empty `description_norm`; the
underlying condition — that prerank cannot tell a GTM role from an engineering
role — was never addressed and was simply masked by better content. Sighting 2
shows it re-surfacing through a different mechanism.

**Sighting 3 (2026-08-06, Wave 8 — first two-source run, greenhouse +
himalayas).** The condition is unchanged by activating a second source, and the
ratio did not improve. Of the **11 items that passed prerank**:

- **4 genuine engineering** — Kubernetes Engineer, Back-End Developer,
  Front-End Developer, Frontend Web Developer.
- **4 GTM** — all four Greenhouse survivors: *Partner Solutions Architect -
  India*, *Solutions Architect - India*, *Enterprise Account Executive -
  Mumbai*, *Partner Sales Director-India*.
- **2 vague-title non-engineering** — *Ambassadors - Worldwide*, *Evangelist*.
- **1 C-suite** — *Chief Data Officer (CDO)*. **Not counted as GTM**
  (operator ruling): that one is a seniority vocabulary gap, logged separately
  as #26.

So 7 of 11 visible items are non-engineering, on a run where the geo filter had
already removed 500 of 530 candidates. Cross-references: the July 2026-07-30
watch item (Sighting 1, closed for its stated cause and incomplete as a
finding), Sighting 2 in the seniority wave, and the G1 wave entry in CLAUDE.md,
which records that the geo filter removed 4 of the 5 then-visible GTM roles
without touching the underlying condition.

**Not fixed, and deliberately so.** No change was made to the prerank
vocabulary, the prerank config, or the scoring rubric in response to this —
operator ruling 2026-08-06, out of scope for the seniority wave and restated
for Wave 8. Recorded here so each sighting is recognised as the same condition
rather than re-diagnosed from scratch. The specced remedy is R2 (title-scoped
role-type exclusions) in research/phase1-eligibility/track5-specs.md; its
schema shipped in v3, its gate deliberately did not.

---

## 26. Seniority terms miss C-suite titles other than `cto` (LOG ONLY)

Surfaced by the first Himalayas run (2026-08-06, Wave 8). A **Chief Data
Officer (CDO)** posting passed prerank and was written as a real opportunity
record (Tier C, 17/5/22). It should have been gated on seniority and was not:
`SENIORITY_LEVELS`'s `management` list carries `cto` but no other C-suite
abbreviation or expansion — not `cdo`, `ciso`, `cio`, `cpo`, `chief * officer`.

A sibling **Chief AI Officer (CAIO)** in the same batch *was* gated — but on
body prose, not its title, so that is not evidence the vocabulary covers the
class. It is the #23 whole-text hazard firing by luck in the useful direction.

**This is a vocabulary gap, not #25 contamination** (operator ruling
2026-08-06): a CDO is not a go-to-market role, it is a C-suite role the
seniority dimension is supposed to exclude and doesn't.

Not fixed. A term-list edit is a scope change under D15 — adding terms means
config gains them, they surface as `available` / `<NEW TERMS>`, and the
operator adopts them by explicit action at the next `oaos setup-scope`. Do NOT
edit the list opportunistically, and do not treat this entry as authorization.

---

## 27. `COUNTRY_NAME_TO_ISO` is missing Barbados and Bahamas — they fail open (LOG ONLY)

Measured on the first two-source run (2026-08-06, Wave 8). Two Himalayas
postings carried `locationRestrictions` of `["Barbados"]` and `["Bahamas"]`.
Neither name is in `COUNTRY_NAME_TO_ISO` (`src/discovery/geo/countries.ts`),
so both mapped to `unresolved`, and under the operator's confirmed
`unresolved: "pass"` policy both passed the geo filter.

One of them — **Chief Data Officer (CDO), Barbados-only** — reached the passed
set and consumed pipeline budget on a posting the operator is not eligible for.
(It is also #26: it should have been gated on seniority first.)

**The filter behaved exactly as designed.** `"pass"` is fail-open by the
operator's own ruling, and every unresolved item is counted and surfaced in the
run summary's Geo line. The defect is purely that the vocabulary has gaps: the
table was curated from the 2026-08-06 census of *observed* values, and small
island states never appeared in it.

Fix is a data addition (more ISO short names) in a later wave. Do NOT touch it
now. Note the generalization when it is fixed: any curated-from-observation
table under-covers by construction, so the durable question is whether
`countries.ts` should carry the full ISO-3166 list rather than an observed
subset — a design decision, not a patch.

---

## 28. Himalayas items normalize with an EMPTY company — `companyName` is never read — **RESOLVED 2026-08-07**

> **RESOLVED 2026-08-07** (`a78105d` fix + test, `adea862` migration). The
> analysis below stands as written; this banner records the outcome.
>
> - **Fix:** `"companyName"` added to the company key list in
>   `adapters/job_board.ts`. One key, with a comment naming this issue.
> - **Regression tests (3):** the load-bearing one asserts the **structural
>   invariant** — two employers sharing a role title must not produce one
>   fingerprint — not field presence. See #30 for why that distinction is the
>   generalizable lesson.
> - **Migration, done before trusting the key:** all **7 of 7** fingerprints
>   changed, confirming the collapse hazard this entry predicted was real and
>   that a key-only fix would have duplicated every record. `Company` and
>   `Fingerprint` were written **together**.
> - **Safety gate:** `research/experience-eligibility/backfill-28.ts` re-ran
>   the *same real* `normalize()` on each captured payload with `companyName`
>   deleted and required byte-identical reproduction of the **stored**
>   fingerprint before writing. All 7 reproduced exactly. Reuse this shape for
>   any migration that changes a dedupe key.
> - **Verified by read-back:** all 7 records now carry a non-empty `Company`
>   and a full 40-character fingerprint.
> - **The "unknown and unrecoverable" collapsed items remain unrecoverable.**
>   The fix stops the loss; it does not recover what was never written.
> - **The unverified Gemini-call hypothesis below was NOT investigated** and is
>   neither confirmed nor refuted. It stays a hypothesis.



Found in the first real Himalayas run (2026-08-06, Wave 8), confirmed at three
levels:

1. **Payload:** Himalayas job objects carry the company under **`companyName`**
   (camelCase) — verified across 227 fetched items and in the captured sample.
2. **Adapter:** `src/engines/normalization/adapters/job_board.ts:46-51` reads
   company from `["company", "company_name", "organization", "employer"]` —
   all snake_case. `companyName` matches **none** of them.
3. **Persisted result:** all 7 Himalayas records written this run have **no
   `Company` field at all** in Airtable (the key is absent, not blank).

**Same defect class as the 2026-08-01 Greenhouse `content`/`location` mapping
bug**: the data is present in the payload under a key the reader does not
check. It was invisible until Himalayas was activated, because no earlier run
ever normalized a Himalayas item.

**Consequences, in order of severity:**

- **The records are unusable for outreach.** Engine 5 resolves contacts by
  company (`findContactsByCompany`), Engine 7 drafts reference the company, and
  `researchOpportunity` fetches a *company* profile. None of that can run
  against an empty string.
- **The fingerprint degrades to `sha1("" | role | himalayas.app)`.** Company
  contributes nothing, so two *different* companies posting an identically
  titled role collapse into one opportunity. 25 of 227 items were dropped as
  within-run duplicates this run; an unknown share of those are genuine
  distinct companies rather than true duplicates.
- **Quality scores are likely depressed** for the affected records (the two
  lowest new records scored Quality 3 and 5). Not isolated — stated as a
  plausible contributor, not a measured cause.

**Hypothesis, NOT verified:** the run spent 67 Gemini calls for 11 items (6.1
each) against a 7.72/item projection derived from a Greenhouse-only run. A
company-less item may skip the research call. Correlation only — no mechanism
was traced, and it must not be reported as a finding without one.

**Why this outranks #23's title-scoped negative gate** (operator ruling
2026-08-06): it corrupts the **fingerprint**. `sha1("" | role | himalayas.app)`
collapses every Himalayas company sharing a role title. The 25 items dropped as
duplicates on the first run cannot be audited — they were never written, so the
genuine share is unknown and unrecoverable. The loss is silent, compounds every
run, and worsens the longer the source stays active. #23 costs *visible*
opportunities; #28 costs *invisible* ones.

**Not fixed, and it is NOT a one-line change.** It requires a **supervised
migration session, and the migration story comes before the key addition.**
`job_board.ts` is inside a frozen engine, the key list is shared by every
job_board source, and changing what `company` resolves to **changes
fingerprints** — which breaks update-in-place for the 7 existing records and
duplicates them on the next run. Adding the key without the migration ships a
second defect on top of the first. Same hazard already recorded for
`normalizeRole` in the Track-2 duplicate analysis. Do NOT fix opportunistically.

**Himalayas stays activated meanwhile** (operator ruling 2026-08-06):
deactivating hides the defect, buys nothing, and the fix needs its own session
regardless; the source's geo and health behaviour are correct.

---

## 29. Himalayas `seniority` is a REQUEST-SIDE RE-SCOPING PARAM, not a filter (DOCUMENTED EXTERNAL-API BEHAVIOUR — not a defect in our code)

Measured 2026-08-07 during the experience-eligibility probe
(`research/experience-eligibility/PROBE.md`). Recorded because the API accepts
the parameter, returns HTTP 200, and returns plausible-looking results — so a
future session **will** rediscover it and reach the same wrong conclusion this
one initially did.

**The endpoint accepts `&seniority=Entry-level` on
`/jobs/api/search`.** It is honoured (isolated from six other candidate param
names; `seniority` alone reproduced a combined probe byte-for-byte). What it
does is **replace the `q=` match set, not filter it.**

**Proven three ways on an `ebpf` control:**

| evidence | measurement |
|---|---|
| `totalCount` **rose** under the param | bare `q=ebpf` → **1**; `q=ebpf&seniority=Entry-level` → **11**. A filter cannot enlarge a match set. |
| the genuine match is **absent** | bare returned exactly one job, `eBPF Engineer - Remote` @ Odigos (`["Senior"]`). It does not appear in the faceted response. Intersection = **0**. |
| results are **off-topic** | 9 of 11 faceted results contain no `ebpf` substring anywhere — a German tax clerk, a Brazilian internship talent pool, a payroll analyst, an SAP consultant. |

**Why `kubernetes` was a misleading control and `ebpf` was the right one.**
With `seniority=` present, `q=` appears to degrade to a loose or largely
ignored match. For a common term there is enough genuine entry-level inventory
to fill the 20-slot page, so results *look* on-topic (Kong, vCluster, Mirantis)
and the re-scoping is invisible. A rare term has no such cover and exposes the
fallback. **Probe rare terms, not representative ones, when testing whether a
parameter filters.**

### The control-design lesson, stated separately because it generalizes

**`totalCount == returned` proves a result set is complete. `totalCount < 20`
does not.** The two disagree on this API even for small sets: `devtools`
returns `totalCount=6` with only **4** jobs; `networking` returns 19 of 636.
The probe prompt's stated criterion (`totalCount < 20`) was **insufficient** and
was correctly replaced with the strict-equality one — which held for exactly
one sweep term (`ebpf`, 1 == 1) and is what made the test decisive. Any future
probe asserting "this response is the complete match set" must use strict
equality.

**Consequence — see #30's sibling note and the CLAUDE.md entry:** experience-
level eligibility has **no request-side mechanism on Himalayas**. If it is
built, it must be a **response-side filter in the G1/geo pattern**. The
"unreachable inventory" claim made earlier in that probe is **withdrawn**, and
A3/Q6 is **not** superseded — it reverts to its prior state (shipped
`enabled: false`, gated on the Adzuna exclusion, untouched).

**Not a defect in our code. Nothing to fix.** `himalayas.ts` never sent this
parameter and still does not.

---

## 30. Normalization defects are caught by structural invariants, not field-presence fixtures (STANDING TEST-DESIGN RULE — read beside the activation protocol)

Promoted to a standing entry after the **third instance of one defect class in
one week**: Greenhouse `content` → description, Greenhouse `location.name` →
location (both 2026-08-01, `53a2fe2`), Himalayas `companyName` → company
(#28, 2026-08-07). Every one has the same shape — *the data is present in the
payload under a key the reader does not check, and everything downstream
degrades quietly.*

**The rule:** for a normalization defect, the assertion that catches it is a
**structural invariant over outputs**, not a fixture asserting a field is
populated.

```
weak    expect(normalize(item).company).toBe("VEXXHOST Inc.")
strong  expect(normalize(a).fingerprint).not.toBe(normalize(b).fingerprint)
        // two employers, same role title
```

**Why the weak form cannot work — this is #21's sibling.** A fixture is written
from the *same reading of the payload* as the adapter. If the adapter misses
`companyName`, the fixture author misses it too, writes `company_name` into the
fixture, and the test **passes against the defect**. The fixture encodes the
misreading. A green suite is not evidence about this class.

**Why the strong form works:** it asserts a property the system must hold
regardless of which key carries the data. It fails for *any* missed company
key, on *any* future source — not only for `companyName` on Himalayas. It is
also the form that states the actual harm: #28's cost was never the blank
column, it was the fingerprint collapse.

**Relationship to the activation protocol** (CLAUDE.md, added 2026-08-06):
the post-run field-completeness check catches this class **empirically, once,
at activation**. This rule catches it **structurally, forever, in the suite**.
They are complementary — neither replaces the other, and the protocol remains
mandatory because only real records expose a key nobody thought to check.
