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

## 7. fabrication_check precision — flags generic connective sentences (LOG ONLY)

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
