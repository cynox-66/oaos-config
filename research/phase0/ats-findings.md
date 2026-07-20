# ATS platform detection — findings

**Run at:** 2026-07-19T15:24:32.206Z
**Total HTTP requests this run:** 34
**Companies parsed from target-companies.txt:** 21

| Company | Tier | Careers URL | Platform | Token (source) | Live posting count | Remote-matching (crude text match) | Watcher viable |
|---|---|---|---|---|---|---|---|
| AccuKnox | Tier 1 | https://accuknox.com/careers | none | accuknox (lowercase-no-punctuation company name) | 0 | 0 | no |
| Red Hat | Tier 1 | https://redhat.com/en/jobs | none | redhat (lowercase-no-punctuation company name) | 0 | 0 | no |
| DSR Corporation | Tier 1 | https://en.dsr-corporation.com/careers | none | dsrcorporation (lowercase-no-punctuation company name) | 0 | 0 | no |
| Amazon Web Services | Tier 1 | — | skipped | n/a (n/a — no company-wide careers URL in source file) | n/a | n/a | team-specific |
| MarketAxess | Tier 1 | https://marketaxess.com/careers | none | marketaxess (lowercase-no-punctuation company name) | 0 | 0 | no |
| IBM | Tier 1 | — | skipped | n/a (n/a — no company-wide careers URL in source file) | n/a | n/a | team-specific |
| SigNoz | Tier 2 | https://signoz.io/careers | none | signoz (lowercase-no-punctuation company name) | 0 | 0 | no |
| Last9 | Tier 2 | https://last9.io/careers | none | last9 (lowercase-no-punctuation company name) | 0 | 0 | no |
| Civo | Tier 2 | https://civo.com/careers | none | civo (lowercase-no-punctuation company name) | 0 | 0 | no |
| Grafana Labs | Tier 2 | https://grafana.com/careers | greenhouse | grafanalabs (lowercase-no-punctuation company name) | 114 | 114 | yes |
| ClickHouse | Tier 2 | https://clickhouse.com/company/careers | greenhouse | clickhouse (lowercase-no-punctuation company name) | 173 | 127 | yes |
| One2N | Tier 2 | https://one2n.io | none | one2n (lowercase-no-punctuation company name) | 0 | 0 | no |
| Appsmith | Tier 2 | https://appsmith.com/careers | none | appsmith (lowercase-no-punctuation company name) | 0 | 0 | no |
| Chainguard | Tier 3 | https://chainguard.dev/careers | greenhouse | chainguard (lowercase-no-punctuation company name) | 80 | 80 | yes |
| Loft Labs | Tier 3 | https://loft.sh/careers | none | loftlabs (lowercase-no-punctuation company name) | 0 | 0 | no |
| Teleport | Tier 3 | https://goteleport.com/careers | lever | teleport (lowercase-no-punctuation company name) | 0 | 0 | yes |
| Tailscale | Tier 3 | https://tailscale.com/careers | greenhouse | tailscale (lowercase-no-punctuation company name) | 38 | 33 | yes |
| Solo.io | Tier 3 | https://www.solo.io/company/careers | none | soloio (lowercase-no-punctuation company name) | 0 | 0 | no |
| Sysdig | Tier 3 | https://www.sysdig.com/careers | lever | sysdig (lowercase-no-punctuation company name) | 5 | 4 | yes |
| LocalStack | Tier 3 | https://localstack.cloud/careers | none | localstack (lowercase-no-punctuation company name) | 0 | 0 | no |
| Swirlds Labs | Tier 3 | https://swirldslabs.com/careers | none | swirldslabs (lowercase-no-punctuation company name) | 0 | 0 | no |

Notes:
- "Remote-matching" is a crude case-insensitive `remote` substring match on location text — not the final classifier (same convention as Step 1).
- Companies with no company-wide careers URL in the source file (Amazon Web Services, IBM) were not probed at all — team-specific hiring, not reachable via a company-board watcher by design.
- A `none` result means no hit on Greenhouse or Lever with the derived token — it does NOT rule out the company being on one of those platforms under a different token; it means this single-token-per-company probe (per Step 2 scope) didn't find it.
- **AccuKnox:** no hit on Greenhouse or Lever with token "accuknox" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Red Hat:** no hit on Greenhouse or Lever with token "redhat" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **DSR Corporation:** no hit on Greenhouse or Lever with token "dsrcorporation" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Amazon Web Services:** not probable via ATS watcher, team-specific (per scope lock: skip entries with no company-wide careers URL)
- **MarketAxess:** no hit on Greenhouse or Lever with token "marketaxess" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **IBM:** not probable via ATS watcher, team-specific (per scope lock: skip entries with no company-wide careers URL)
- **SigNoz:** no hit on Greenhouse or Lever with token "signoz" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Last9:** no hit on Greenhouse or Lever with token "last9" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Civo:** no hit on Greenhouse or Lever with token "civo" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **One2N:** no hit on Greenhouse or Lever with token "one2n" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Appsmith:** no hit on Greenhouse or Lever with token "appsmith" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Loft Labs:** no hit on Greenhouse or Lever with token "loftlabs" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Solo.io:** no hit on Greenhouse or Lever with token "soloio" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **LocalStack:** no hit on Greenhouse or Lever with token "localstack" — company may use a different ATS (Ashby, in-house, etc.) or a different token
- **Swirlds Labs:** no hit on Greenhouse or Lever with token "swirldslabs" — company may use a different ATS (Ashby, in-house, etc.) or a different token

## Platform counts

- Greenhouse: 4
- Lever: 2
- Workday: 0
- No hit (none): 13
- Skipped (team-specific / out-of-scope platform): 2

## Recommendation — ready for Phase 1 Greenhouse/Lever watcher build now

- **Grafana Labs** (Tier 2) — greenhouse, token `grafanalabs`, 114 live postings.
- **ClickHouse** (Tier 2) — greenhouse, token `clickhouse`, 173 live postings.
- **Chainguard** (Tier 3) — greenhouse, token `chainguard`, 80 live postings.
- **Teleport** (Tier 3) — lever, token `teleport`, 0 live postings.
- **Tailscale** (Tier 3) — greenhouse, token `tailscale`, 38 live postings.
- **Sysdig** (Tier 3) — lever, token `sysdig`, 5 live postings.

## Step 2b — targeted re-probe (final Phase 0 step)

**Run at:** 2026-07-19T15:36:56.754Z
**Total HTTP requests this run:** 38 / 40 cap

### Task 3 — Red Hat Workday (`redhat.wd5.myworkdayjobs.com`, tenant `redhat`, site `Jobs`)

- Total live postings (empty searchText): 228
- Total matching searchText `"remote india"`: 19

### Task 1 — Ashby checks

| Company | Names tried | Hit | Live postings | Remote-matching |
|---|---|---|---|---|
| SigNoz | signoz | signoz | 12 | 7 |
| Chainguard | chainguard | none | 0 | 0 |
| Loft Labs | loftlabs, loft-labs, loft | loft | 0 | 0 |
| Swirlds Labs | swirldslabs, swirlds-labs, hashgraph | hashgraph | 2 | 2 |
| Teleport | teleport | none | 0 | 0 |

- **Chainguard:** no hit on Ashby for any of: chainguard
- **Teleport:** no hit on Ashby for any of: teleport

### Task 4 — Teleport sanity check

- Lever (`teleport`, full page): 0 live postings
- Ashby (`teleport`): 0 live postings
- **Verdict: Neither Lever nor Ashby show live postings for Teleport right now — both checked, both empty.**

### Task 2 — Token-variant retry (Greenhouse + Lever), India-relevant misses

| Company | Variants tried | Platform | Hit token | Live postings | Remote-matching |
|---|---|---|---|---|---|
| AccuKnox | accuknox | none | — | 0 | 0 |
| Last9 | last9, last9io | none | — | 0 | 0 |
| Civo | civo, civocloud | none | — | 0 | 0 |
| One2N | one2n, one2ninc | none | — | 0 | 0 |
| Appsmith | appsmith, appsmithinc | none | — | 0 | 0 |
| Solo.io | soloio, solo | none | — | 0 | 0 |
| LocalStack | localstack, localstackcloud | none | — | 0 | 0 |

- **AccuKnox:** no hit on Greenhouse or Lever for any of: accuknox
- **Last9:** no hit on Greenhouse or Lever for any of: last9, last9io
- **Civo:** no hit on Greenhouse or Lever for any of: civo, civocloud
- **One2N:** no hit on Greenhouse or Lever for any of: one2n, one2ninc
- **Appsmith:** no hit on Greenhouse or Lever for any of: appsmith, appsmithinc
- **Solo.io:** no hit on Greenhouse or Lever for any of: soloio, solo
- **LocalStack:** no hit on Greenhouse or Lever for any of: localstack, localstackcloud

