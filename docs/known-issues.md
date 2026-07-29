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
