# Changelog — Contact Discovery & Ranking Engine (Engine 5)

## [Initial] — 2026-06-24

Implemented Engine 5 (Contact Discovery & Ranking Engine) per
`docs/engine-specs.md` Section 5, with all spec gaps resolved by operator
direction (Contact = spec-5 + `relationship` + `identity_uncertain`; domain-aware
role_relevance config; single +2 channel rule; cap-then-penalty ordering;
dedupe/merge boundary; seniority derivation; max-across-domains relevance;
recruiter-aware primary selection). Scope is Engine 5 only; Engines 1–4 and
6–12 are untouched. The github-contributor-scan.ts script was not modified.

### Added
- `Contact` (a `type`, so it is assignable to the Engine 2/4 Contact view —
  compile-time-checked), `RankedContacts`, `DiscoveryRequest`, and the per-source
  input shapes (`GithubScanContact`, `ManualContactInput`) + unified
  `CandidateContact`.
- Source adapters behind a `SourceAdapter<TRaw>` interface: `fromGithubScan`
  (maps the scan script's output, empty-string→null) and `fromManual`.
- `dedupe.ts` — union-find clustering: merge on full name+company or shared
  github/linkedin handle; `identity_uncertain` on same-first-name+company /
  different-github ambiguities; strongest-signal field merge.
- `rank.ts` — `computeReachability` (base + single direct/email channel +
  twitter|blog + followers>100, cap 5, then −1 stale, floor 1),
  `computeRoleRelevance` (max across domains, domain-aware), `computeSeniority`,
  rank comparator (role_relevance → reachability → seniority → id), and
  recruiter-aware primary selection.
- `config.ts` — reachability constants, the tunable domain→title→score
  role_relevance map, seniority keyword rules, and the seniority_pref order.
- Reuses Engine 1's `sha1` for the deterministic contact id.
- Vitest suite (30 tests): reachability spot-checks + penalty, role_relevance,
  seniority, dedupe + identity_uncertain, ranking determinism, primary sanity
  (10 fixtures, ≥80%), recruiter-last, seniority tie-break, github adapter, empty
  path, and the Engine 2/4 assignability guard.
- Engine README and TSDoc.

### Tooling
- No new dependencies. Pure sync logic — no LLM, no network, no async. No
  `tsconfig` added (repo runs `.ts` via `tsx`).
