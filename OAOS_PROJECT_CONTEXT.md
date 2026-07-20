# OAOS — Complete Project Context

Last updated: July 20, 2026

---

## What OAOS Is

OAOS (Opportunity Acquisition OS) is a personal, low-cost opportunity acquisition
engine that discovers, scores, prepares, and helps execute opportunities that can
generate income, career growth, or strategic leverage — with minimal manual effort.

It is NOT a CRM, NOT an OSS networking tool, NOT an AI research project. Tracking
exists only to support acquisition. OSS is one source among many, not the primary
one. The primary targets are remote jobs, internships, freelance work, and any paid
work. The root objective is income.

---

## Who Is Building It

Dev Jaiswal — first-year B.Tech CSE(AI) student graduating 2029, based in
Bareilly, India. GitHub: cynox-66. Portfolio: devjaiswal.me. OSS contributor
to Krkn Chaos, KubeArmor, Hiero Heka Identity Platform, kubestellar/ui — NOT
Antrea (zero verified PRs) per the 2026-07-19 correction. Stack: TypeScript,
React, Node.js, NestJS, Kubernetes, Go (learning), Rust (learning).

## Product Model

Single-operator, open-sourceable, bring-your-own-keys (per D16/D17 —
see docs/DISCOVERY-SYNTHESIS-DECISIONS.md). Each user supplies their own
Gemini API key and Airtable base; there is no hosted/multi-tenant SaaS
offering. Install instructions and a setup guide (keys, resume, profile,
evidence file) will live on the static docs site.

---

## Hard Constraints (Non-Negotiable)

- Operating cost: ₹0/month preferred, ₹100/month maximum
- Maintenance: <1 hour/week
- Single operator, no server babysitting, no enterprise infrastructure
- Human approves all outreach/applications — OAOS prepares and executes, never
  decides autonomously
- Time is NOT a constraint — willing to spend months building properly

---

## Repository

Private repo: github.com/cynox-66/oaos-config
Local path: ~/Desktop/OAOS

## Tech Stack

- Language: TypeScript (tsx direct execution, no tsconfig by design)
- Test framework: vitest (`npm test` = `vitest run`)
- LLM: Gemini 3.1 Flash Lite (via Google AI Studio API, free tier)
- Database: Airtable (REST API v0, no SDK, raw fetch)
- Automation: Make.com (planned, not yet built)
- Notifications: Telegram Bot (configured, not yet wired)
- MCP: Serena (symbol-level code navigation for token efficiency)
- Session memory: CLAUDE.md at repo root (auto-loaded by Claude Code)

---

## Gemini Model Status (Critical — Read This)

Current model: `gemini-3.1-flash-lite`
Project: OAOS-v2 (fresh Google Cloud project, free tier)
Rate limits: 15 RPM / 500 RPD

History of model issues (so you don't repeat the debugging):
- gemini-2.0-flash: permanently zero free-tier allocation. Do not use.
- gemini-3.5-flash: works but only 5 RPM / 20 RPD on free tier. Too tight
  for the pipeline's 4-call burst (3 evidence-matching + 1 scoring).
- gemini-2.5-flash: works, but same tight limits as 3.5-flash.
- gemini-3.1-flash-lite: works, 15 RPM / 500 RPD, fastest response time.
  This is the current production model.
- Old project "OAOS" had billing/prepayment issues. Abandoned. Using "OAOS-v2".

If 429s recur: check https://aistudio.google.com/app/apikey rate-limit
dashboard FIRST before assuming code is at fault.

Single source of truth for model string: src/engines/scoring/config.ts GEMINI_MODEL

---

## Architecture (Frozen)

```
INPUTS (all sources equal)
  Jobs · Internships · Freelance · Startup · Network · OSS
            │
DISCOVERY LAYER (permanent, matures Stage 1→2→3)
            │
INTELLIGENCE LAYER
  C2 Scoring → C5 Recommended Action
  C3 Contact Discovery    C4 Evidence Matching
            │
PREPARATION LAYER
  C6 Application Package · C7 Outreach Package
  C8 Follow-up Scheduling
            │
HUMAN GATE (review · edit · approve)
            │
EXECUTION LAYER (post-approval only)
  C9 Send · Submit · Update · Trigger follow-ups
            │
MEASUREMENT LAYER
  C10 Source Performance · C11 Income Attribution
            │
LONG-TERM INTELLIGENCE (C12)
  Feeds weights back into Discovery + Scoring
```

---

## 12 Capabilities (All Engines Built)

| # | Capability | Engine | Status | LLM? |
|---|---|---|---|---|
| C1 | Multi-source discovery | Engine 1 (Normalization) | ✅ Built | No |
| C2 | Opportunity scoring | Engine 2 (Scoring) | ✅ Built | Yes — Gemini |
| C3 | Contact discovery | Engine 5 (Contact Ranking) | ✅ Built | No |
| C4 | Evidence matching | Engine 3 (Evidence Matching) | ✅ Built | Yes — Gemini |
| C5 | Recommended action | Engine 4 (Recommended Action) | ✅ Built | No |
| C6 | Application preparation | Engine 6 (Application Package) | ✅ Built | Yes — Gemini |
| C7 | Outreach preparation | Engine 7 (Outreach Package) | ✅ Built | Yes — Gemini |
| C8 | Follow-up management | Engine 8 (Follow-Up) | ✅ Built | Yes — Gemini |
| C9 | Auto-execution (post-approval) | Not yet implemented | ❌ | — |
| C10 | Source performance | Engine 9 (Source Performance) | ✅ Built | No |
| C11 | Income attribution | Engine 10 (Income Attribution) | ✅ Built | No |
| C12 | Long-term intelligence | Engine 12 (Long-Term Intelligence) | ✅ Built | No |

Additional: Engine 11 (Source Admission Framework) ✅ Built

---

## What's Built and On Main

### Engines (src/engines/)
All 12 engines implemented, tested, and merged to main.
341 tests passing across 28 test files (as of last merge).
Each engine: types.ts, main logic, config.ts, index.ts, tests/, README, CHANGELOG.

### Pipeline (src/pipeline/)
- intake.ts: RawItem → full pipeline → PipelineResult
- research.ts: real Gemini company research (was null stub, now wired)
- Pipeline calls: normalize → research → rankContacts → match → score → recommend → prepare

### Persistence (src/persistence/)
- Thin Airtable REST v0 client (raw fetch, no SDK)
- Writes Opportunities, Contacts, Outreach to Airtable
- Reads by fingerprint (dedupe) and by company name (re-scoring)
- Configurable field names in config.ts (single place to fix mismatches)
- Rate limit retry (429 → exponential backoff, max 3)

### CLI (cli/)
Five commands operational:
- `oaos intake` — interactive prompts → full pipeline → Airtable write
- `oaos intake --url <url>` — fetch URL → extract → pipeline → write
- `oaos score --company <name>` — re-score existing opportunity
- `oaos contacts --repo <owner/repo>` — run GitHub scan → import contacts
- `oaos report` — weekly acquisition metrics
- `oaos discover` — parse email alerts from discovery-inbox/ folder

### Discovery
- Stage 1 (manual): operational via `oaos intake`
- Stage 2 (semi-automated): 6 email-alert parsers built + `oaos discover` command
  - LinkedIn, Indeed, Wellfound, We Work Remotely, Upwork, Remote OK
  - File-based input (drop .eml/.txt in discovery-inbox/, run oaos discover)
  - Processed files move to discovery-inbox/processed/
- Stage 3 (automated feeds): not yet built

### Evidence Inventory
- evidence/inventory.md — 6 assets (KubeStellar PR, OID4VP RFC, Krkn/KubeArmor/Antrea contributions, devjaiswal.me)
- Loaded by evidence-matching engine at runtime

### GitHub Contact Scanner
- scripts/github-contributor-scan.ts — scans repos for contributors
- Already run against krkn-chaos/krkn (27 contacts found)
- Not yet run against KubeArmor or Antrea

---

## Airtable Base

Base name: OAOS
Four tables: Opportunities, Contacts, Evidence Assets, Outreach
Full schema documented in docs/airtable-spec.md (field names, types, formulas, views)

Key facts:
- Total Score and Tier are FORMULA fields — never write them via API
- Persistence layer field names live in src/persistence/config.ts
- PAT (Personal Access Token) used, not legacy API key
- .env has AIRTABLE_API_KEY and AIRTABLE_BASE_ID

---

## Authoritative Documents in Repo

| Document | Purpose | When to read |
|---|---|---|
| CLAUDE.md | Session memory for Claude Code | Auto-loaded every session |
| ROADMAP.md | Frozen vision, capability map, phase plan | When planning new phases |
| docs/engine-specs.md | All 12 engine specifications | When implementing/modifying an engine |
| docs/airtable-spec.md | Exact Airtable schema | When touching persistence or Airtable |
| evidence/inventory.md | C4 evidence source of truth | When adding/reviewing evidence assets |
| scoring/rubric.md | Two-axis scoring rubric with examples | When calibrating scores |
| docs/DISCOVERY-SYNTHESIS-DECISIONS.md | D-numbered decision log (incl. D15-D18) | When a decision's rationale is needed |

---

## Key Engineering Conventions

- Pure functions where possible; LLM calls only in Engines 2, 3, 6, 7, 8
- GeminiClient is injectable — defined in src/engines/scoring/gemini.ts, reused everywhere
- Cross-engine type boundaries verified via compile-time structural assignability guards
- Banned-phrase and fabrication checks are hard regex/trace checks, never LLM self-judgment
- No engine sends anything — execution is post-approval only
- Feature branches: feat/<name>, merged to main after full suite passes
- When a spec is ambiguous: STOP and ask, never resolve with own design judgment

---

## What Is NOT Built Yet (in roadmap order)

### Near-term (next to build)
1. Follow-up CLI command — Engine 8 exists but has no `oaos followup` CLI command
2. Stage 3 automated discovery — RSS/API-based feeds, per-source admission-tested
3. Make.com automation scenarios — follow-up reminders, daily digest, draft generation

### Medium-term
4. Approval-based auto-execution (C9) — send outreach/applications after human approval
5. Outcomes table in Airtable — for Engine 9/10 measurement to have real data
6. Weekly acquisition report automation — Telegram daily digest

### Long-term
7. Long-term intelligence (C12) operational — needs accumulated outcome data first
8. Source performance dashboards
9. Income attribution reporting

### Permanently excluded
Multi-agent systems, RAG, vector databases, knowledge graphs, hosted/multi-tenant
frontend (a local, self-hosted web UI served by OAOS on the operator's machine is
permitted per D16 — see docs/DISCOVERY-SYNTHESIS-DECISIONS.md), local LLM
infrastructure, relationship influence scoring, unapproved autonomous
outreach/applications, enterprise-grade automation.

---

## Recent Session History (for continuity)

### What was accomplished in the last major session (July 8-9, 2026):
- All 12 engines implemented and merged (Engines 1-12)
- Pipeline wiring layer built and merged
- Airtable persistence layer built and merged
- CLI with 5 commands built and merged
- Research enrichment (replacing null stub) built and merged
- Stage 2 discovery (6 email-alert parsers + oaos discover command) built and merged
- Gemini model debugging saga resolved (see Gemini Model Status above)
- Final model: gemini-3.1-flash-lite on OAOS-v2 project
- Serena MCP configured for token-efficient development
- CLAUDE.md created as session memory file
- Total test count on main: 341 passing / 28 files

### What was explicitly deferred:
- Running github-contributor-scan against KubeArmor and Antrea repos
- Populating Airtable with real opportunities (no live data beyond test records)
- Actually using the system for real opportunity acquisition
- Stage 3 discovery (automated feeds)
- Make.com automation setup
