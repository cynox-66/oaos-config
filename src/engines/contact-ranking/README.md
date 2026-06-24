# Contact Discovery & Ranking Engine (Engine 5)

Finds the human(s) for an opportunity and ranks who to approach first. It is a
**pure, synchronous, deterministic** function: no LLM, no network, no live
fetching — candidate sources are passed in as pre-fetched structured arrays.
There is **no influence scoring** (banned by charter); ranking is reachability +
role-relevance + seniority only.

## `DiscoveryRequest` (input) → `RankedContacts` (output)

```ts
DiscoveryRequest {
  opportunity: Opportunity            // company, domain
  githubScan?: GithubScanContact[]    // output of scripts/github-contributor-scan.ts
  manual?: ManualContactInput[]       // LinkedIn / CNCF Slack / public team page entries
}

RankedContacts {
  opportunity_id: string
  ordered: Contact[]                  // ranked best-first
  primary_contact_id: string | null
}
```

### `Contact`

Spec-5 fields plus two authorized additions — `relationship` (so the record is
assignable to the `Contact` view Engines 2 & 4 consume; defaults to `"Cold"`)
and `identity_uncertain`:

```ts
Contact {
  id, name, company, title,
  seniority: "Founder"|"Eng Manager"|"Staff/Principal"|"Senior"|"Mid"|"Recruiter",
  channels: { github, email, linkedin, slack },
  reachability: 1..5,
  role_relevance: 1..5,
  oss_overlap, last_verified, primary,
  relationship: ContactRelationship,  // default "Cold"
  identity_uncertain: boolean         // default false
}
```

## How ranking works

1. **Adapt** each source array to a unified candidate (GitHub scan + manual
   adapters).
2. **Dedupe**: merge candidates on full normalized name + company, or a shared
   github/linkedin handle; on merge, union channels and keep the strongest
   signal per field. Two candidates with the **same first name + company but
   different github handles** (and no full-name/handle match) are **not merged**
   and both get `identity_uncertain = true`.
3. **Score** each contact:
   - `reachability (1..5)` = `1 base + 2 (any direct/email channel: email OR
     active github OR active slack) + 1 (twitter OR blog) + 1 (followers>100)`,
     capped at 5, **then** `−1` if `last_verified` is older than 6 months (floor 1).
   - `role_relevance (1..5)` = **max** across the opportunity's domains of a
     domain-aware title score (core-domain = 5, adjacent = 4, generic engineer =
     3, recruiter = 2, unrelated = 1; unrecognized title → 3; empty domain → 3).
     The mapping lives in `config.ts` and is **tunable**.
   - `seniority` from a title-keyword config.
4. **Rank** by `(role_relevance desc, reachability desc, seniority_pref)` where
   `seniority_pref` = Founder > Eng Manager > Staff/Principal > Senior > Mid >
   Recruiter; ties break deterministically by id.
5. **Primary** = the first **non-recruiter** in rank order (a recruiter becomes
   primary only when no non-recruiter exists); `null` when there are no contacts.
   `ordered` itself is not reordered for recruiters — only primary selection is
   recruiter-aware.

## Adding a new source adapter

Implement `SourceAdapter<TRaw>` in `adapters/` (an `adapt(raw): CandidateContact`
function), export it from `adapters/index.ts`, add the raw array to
`DiscoveryRequest`, and map it in `rankContacts`. Do **not** modify the
`github-contributor-scan.ts` script — the adapter consumes its output shape.

## Usage

```ts
import { rankContacts } from "./index";

const ranked = rankContacts({ opportunity, githubScan, manual });
const deterministic = rankContacts(request, { now: fixedDate }); // for staleness
```

## Running tests

```bash
npm test
```

Covers: dedupe (name+company and handle), `identity_uncertain`, the reachability
formula and `last_verified` penalty, domain-aware `role_relevance`, seniority
derivation, ranking determinism, primary sanity (≥80% on 10 fixtures), the
recruiter-last rule, seniority tie-break, the GitHub scan adapter, the empty
path, and a compile-time guard that `Contact` is assignable to Engines 2/4's
view. Pure function — no mocks.
