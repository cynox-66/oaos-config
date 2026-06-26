# OAOS Airtable — Complete Specification

This document is the ground truth for the OAOS Airtable base.
Every field name, type, option, formula, and view is specified exactly.
Field names in this document must match `src/persistence/config.ts` FIELD_NAMES exactly.

---

## Base name: `OAOS`

## Four tables (create in this order — links require the target table to exist first)

```
1. Evidence Assets    ← no incoming links; create first
2. Contacts           ← no incoming links from other tables
3. Opportunities      ← links to Contacts, Evidence Assets, Outreach
4. Outreach           ← links to Opportunities, Contacts, Evidence Assets
```

---

## Field type legend

```
TXT   Single line text
LTXT  Long text (rich text enabled unless noted)
URL   URL
EMAIL Email
NUM   Number
RATE  Rating (star)
SEL   Single select
MSEL  Multiple select
DATE  Date (date only, no time)
LINK  Link to another record
FORM  Formula (computed by Airtable — cannot be written via API)
```

---

## TABLE 1: Evidence Assets

**Primary field:** Title (TXT)

| # | Field name | Type | Options / formula | API writable | Notes |
|---|---|---|---|---|---|
| 1 | Title | TXT | — | ✅ | Primary field |
| 2 | Type | SEL | PR, Article, RFC, Project, Talk, Issue, Freelance, Client | ✅ | |
| 3 | URL | URL | — | ✅ | |
| 4 | Relevance | TXT | — | ✅ | One sentence: what capability this proves |
| 5 | Tech Tags | MSEL | Kubernetes, Go, Rust, TypeScript, React, eBPF, Security, Chaos Engineering, Networking, CI/CD | ✅ | |
| 6 | Date | DATE | — | ✅ | Date the asset was created/merged |
| 7 | Opportunities | LINK | → Opportunities, allow multiple | Auto | Reverse link — Airtable creates automatically |

### Evidence Assets views

| View name | Type | Config |
|---|---|---|
| Grid view | Grid | Default, no filter |
| By Type | Kanban | Group by: Type |
| Security | Grid | Filter: Tech Tags contains "Security" OR "eBPF" |
| Cloud-Native | Grid | Filter: Tech Tags contains "Kubernetes" OR "Chaos Engineering" OR "Networking" |

---

## TABLE 2: Contacts

**Primary field:** Name (TXT)

| # | Field name | Type | Options / formula | API writable | Notes |
|---|---|---|---|---|---|
| 1 | Name | TXT | — | ✅ | Primary field |
| 2 | Title | TXT | — | ✅ | e.g. "Staff SRE", "CTO", "Maintainer" |
| 3 | Seniority | SEL | Founder, VP/Director, Staff/Principal, Senior, Mid, Recruiter | Manual | Not written by persistence layer |
| 4 | GitHub URL | URL | — | ✅ | |
| 5 | LinkedIn URL | URL | — | ✅ | |
| 6 | Email | EMAIL | — | ✅ | |
| 7 | Relationship | SEL | Cold, GitHub Interaction, Slack, Warm, Met | ✅ | |
| 8 | OSS Overlap | TXT | — | ✅ | |
| 9 | Reachability | RATE | 1–5 stars | ✅ | |
| 10 | Last Contacted | DATE | — | ✅ | |
| 11 | Notes | LTXT | rich text | ✅ | Persistence folds: bio, company, location, seniority, role_relevance, identity_uncertain |
| 12 | Company | LINK | → Opportunities, allow multiple | Auto | Reverse link from Opportunities "Contacts". Rename from "Opportunities" to "Company" after Airtable creates it |

### Contacts views

| View name | Type | Config |
|---|---|---|
| Grid view | Grid | Default |
| By Relationship | Kanban | Group by: Relationship |
| High Reachability | Grid | Filter: Reachability ≥ 4 stars. Sort: Name ascending |
| OSS Network | Grid | Filter: OSS Overlap is not empty |

---

## TABLE 3: Opportunities

**Primary field:** Company (TXT)

### 3a. Core data fields (written by persistence layer)

| # | Field name | Type | Options | API writable | Persistence config key |
|---|---|---|---|---|---|
| 1 | Company | TXT | — | ✅ | `company` |
| 2 | Role | TXT | — | ✅ | `role` |
| 3 | Category | SEL | Job, Internship, Freelance, Startup, OSS, Other | ✅ | `category` |
| 4 | Domain | MSEL | Cloud-Native, Kubernetes, Security, DevTools, Infra, eBPF, Chaos Engineering, Observability, Networking, Web/Frontend, Backend, Data, AI/ML, Other | ✅ | `domain` |
| 5 | Source | SEL | GitHub, CNCF Landscape, CNCF Slack, LFX Portal, YC, LinkedIn, Wellfound, Upwork, Contra, Referral, Manual, Other | ✅ | `source_name` — enable "Allow creating new options" |
| 6 | Source URL | URL | — | ✅ | `source_url` |
| 7 | Date Found | DATE | — | ✅ | `date_found` |
| 8 | Status | SEL | Discovered, Scored, Targeted, Drafted, Sent, Responded, Interviewing, Offer, Rejected, Archived | ✅ | `status` |
| 9 | Quality Score | NUM | Integer, 0–50 | ✅ | `quality_score` |
| 10 | Match Score | NUM | Integer, 0–50 | ✅ | `match_score` |
| 11 | Fingerprint | TXT | — | ✅ | `fingerprint` — do not edit manually |
| 12 | Opportunity ID | TXT | — | ✅ | `id` |
| 13 | Notes | LTXT | rich text | ✅ | `notes` |

### 3b. Formula fields — Airtable computes these. DO NOT write via API.

| # | Field name | Type | Exact formula |
|---|---|---|---|
| 14 | Total Score | FORM | `{Quality Score} + {Match Score}` |
| 15 | Tier | FORM | `IF({Total Score} >= 85, "S", IF({Total Score} >= 70, "A", IF({Total Score} >= 50, "B", "C")))` |
| 16 | Window Alert | FORM | `IF(AND({Application Window}, DATETIME_DIFF({Application Window}, TODAY(), 'days') <= 14, DATETIME_DIFF({Application Window}, TODAY(), 'days') > 0), "⚠️ " & DATETIME_DIFF({Application Window}, TODAY(), 'days') & " days left", "")` |

### 3c. Manual-only fields (not written by persistence layer)

| # | Field name | Type | Purpose |
|---|---|---|---|
| 17 | Application Window | DATE | LFX/GSoC application deadlines — fill manually |

### 3d. Link fields

| # | Field name | Type | Config | API writable | Persistence config key |
|---|---|---|---|---|---|
| 18 | Contacts | LINK | → Contacts, allow multiple | ✅ | `contacts` |
| 19 | Evidence Assets | LINK | → Evidence Assets, allow multiple | ✅ | `evidence_assets` |
| 20 | Outreach | LINK | → Outreach, allow multiple | ✅ | `outreach` |

### CRITICAL: Total Score and Tier are formula fields

The persistence layer config lists them but they must NOT be included in API write payloads.
Airtable will return a 422 error if you attempt to write to a formula field.
Fix in `src/persistence/records.ts`: the opportunity record mapper must exclude Total Score and Tier from POST/PATCH payloads. Airtable computes them automatically from Quality Score and Match Score.

### Opportunities views

| View name | Type | Config |
|---|---|---|
| Grid view | Grid | Default, all fields visible |
| Pipeline | Kanban | Group by: Status |
| Tier S + A | Grid | Filter: Tier is "S" OR Tier is "A". Sort: Total Score descending |
| LFX / GSoC Tracker | Grid | Filter: Category is "OSS". Sort: Application Window ascending |
| Stale | Grid | Filter: Status is "Discovered" AND Date Found is before 14 days ago |
| This Week | Calendar | Date field: Date Found |

---

## TABLE 4: Outreach

**Primary field:** Label (TXT)

### 4a. Core data fields (written by persistence layer)

| # | Field name | Type | Options | API writable | Persistence config key |
|---|---|---|---|---|---|
| 1 | Label | TXT | — | ✅ | `label` — format: "{Company} — {Contact Name}" |
| 2 | Channel | SEL | Email, LinkedIn, GitHub, Slack, Twitter/X | ✅ | `channel` |
| 3 | Draft | LTXT | rich text | ✅ | `draft` |
| 4 | Status | SEL | Drafted, Approved, Sent, Replied, No Response, Bounced | ✅ | `status` |
| 5 | Sent Date | DATE | — | ✅ | `sent_date` |
| 6 | Follow-Up Status | SEL | None Sent, FU1 Sent, FU2 Sent, FU3 Sent, Complete | ✅ | `follow_up_status` |
| 7 | Notes | LTXT | rich text | ✅ | `notes` — constraint violations, customization notes |

### 4b. Formula fields — Airtable computes these. DO NOT write via API.

| # | Field name | Type | Exact formula |
|---|---|---|---|
| 8 | Follow-Up 1 Due | FORM | `IF(AND({Sent Date}, {Status} = "Sent"), DATEADD({Sent Date}, 4, 'days'), "")` |
| 9 | Follow-Up 2 Due | FORM | `IF(AND({Sent Date}, {Status} = "Sent"), DATEADD({Sent Date}, 10, 'days'), "")` |
| 10 | Follow-Up 3 Due | FORM | `IF(AND({Sent Date}, {Status} = "Sent"), DATEADD({Sent Date}, 17, 'days'), "")` |

### 4c. Link fields

| # | Field name | Type | Config | API writable | Persistence config key |
|---|---|---|---|---|---|
| 11 | Opportunity | LINK | → Opportunities, single record | ✅ | `opportunity` |
| 12 | Contact | LINK | → Contacts, single record | ✅ | `contact` |
| 13 | Evidence Used | LINK | → Evidence Assets, allow multiple | Manual | Not in persistence layer — fill manually |

### Outreach views

| View name | Type | Config |
|---|---|---|
| Grid view | Grid | Default |
| Pipeline | Kanban | Group by: Status |
| Follow-Ups Due | Grid | Filter: Status is "Sent" AND Follow-Up Status is not "Complete". Sort: Follow-Up 1 Due ascending |
| This Week Sent | Grid | Filter: Sent Date is within the past 7 days |

---

## Single select option values (exact strings — case-sensitive)

The persistence layer writes these strings verbatim. They must match exactly.

### Category
`Job` · `Internship` · `Freelance` · `Startup` · `OSS` · `Other`

### Status (Opportunities)
`Discovered` · `Scored` · `Targeted` · `Drafted` · `Sent` · `Responded` · `Interviewing` · `Offer` · `Rejected` · `Archived`

### Source
`GitHub` · `CNCF Landscape` · `CNCF Slack` · `LFX Portal` · `YC` · `LinkedIn` · `Wellfound` · `Upwork` · `Contra` · `Referral` · `Manual` · `Other`

Enable **"Allow creating new options"** on this field. The engine source_name is a free-form string and may not match a predefined option exactly.

### Domain (multiple select)
`Cloud-Native` · `Kubernetes` · `Security` · `DevTools` · `Infra` · `eBPF` · `Chaos Engineering` · `Observability` · `Networking` · `Web/Frontend` · `Backend` · `Data` · `AI/ML` · `Other`

### Relationship
`Cold` · `GitHub Interaction` · `Slack` · `Warm` · `Met`

### Seniority
`Founder` · `VP/Director` · `Staff/Principal` · `Senior` · `Mid` · `Recruiter`

### Type (Evidence Assets)
`PR` · `Article` · `RFC` · `Project` · `Talk` · `Issue` · `Freelance` · `Client`

### Tech Tags (multiple select)
`Kubernetes` · `Go` · `Rust` · `TypeScript` · `React` · `eBPF` · `Security` · `Chaos Engineering` · `Networking` · `CI/CD`

### Channel (Outreach)
`Email` · `LinkedIn` · `GitHub` · `Slack` · `Twitter/X`

### Status (Outreach)
`Drafted` · `Approved` · `Sent` · `Replied` · `No Response` · `Bounced`

### Follow-Up Status
`None Sent` · `FU1 Sent` · `FU2 Sent` · `FU3 Sent` · `Complete`

---

## Setup sequence (exact order)

**Step 1.** Create base named `OAOS`.

**Step 2.** Create `Evidence Assets` table.
- Set primary field to "Title" (single line text).
- Add fields 2–6 from Table 1 spec above.
- Do not add the reverse link ("Opportunities") — Airtable creates it automatically in Step 4.

**Step 3.** Create `Contacts` table.
- Set primary field to "Name" (single line text).
- Add fields 2–11 from Table 2 spec above.
- Do not add the reverse link — Airtable creates it in Step 4.

**Step 4.** Create `Opportunities` table.
- Set primary field to "Company" (single line text).
- Add fields 2–13 (core data fields).
- Add formula fields 14–16.
- Add field 17 (Application Window, date).
- Add link fields: "Contacts" → Contacts (allow multiple); "Evidence Assets" → Evidence Assets (allow multiple).
- Skip the "Outreach" link for now — Outreach table doesn't exist yet.
- After this step: check Contacts table. Airtable will have created a reverse link named "Opportunities". Rename it to "Company".
- After this step: check Evidence Assets table. Rename the auto-created reverse link to "Opportunities" (or leave as-is).

**Step 5.** Create `Outreach` table.
- Set primary field to "Label" (single line text).
- Add fields 2–7 (core data fields).
- Add formula fields 8–10.
- Add link fields: "Opportunity" → Opportunities (single record); "Contact" → Contacts (single record); "Evidence Used" → Evidence Assets (allow multiple).

**Step 6.** Go back to `Opportunities` table. Add the "Outreach" link field → Outreach (allow multiple).

**Step 7.** Create all views per the view specs above (14 views total across 4 tables).

**Step 8.** Pre-populate `Evidence Assets` with the 6 assets from `evidence/inventory.md`.

---

## API payload examples

### POST new opportunity
```json
{
  "fields": {
    "Company": "Isovalent",
    "Role": "Software Engineer — eBPF",
    "Category": "Job",
    "Domain": ["Kubernetes", "Security", "eBPF"],
    "Source": "GitHub",
    "Source URL": "https://isovalent.com/careers",
    "Date Found": "2026-06-24",
    "Status": "Discovered",
    "Quality Score": 15,
    "Match Score": 20,
    "Fingerprint": "abc123def456...",
    "Opportunity ID": "opp_isovalent_xyz",
    "Notes": "eBPF core company. KubeArmor overlap is direct."
  }
}
```

Do NOT include Total Score or Tier — Airtable computes them.

### POST new contact
```json
{
  "fields": {
    "Name": "Naga Ravi Chaitanya Elluri",
    "Title": "Senior Engineer",
    "GitHub URL": "https://github.com/nagarajuelli",
    "Email": "",
    "Relationship": "Cold",
    "OSS Overlap": "KubeArmor contributor — eBPF-based runtime security",
    "Reachability": 4,
    "Notes": "Company: Red Hat\nContributions to kubearmor/KubeArmor: 158\nFollowers: 45"
  }
}
```

### PATCH opportunity to link contacts
```json
{
  "fields": {
    "Contacts": ["recABCDEFGHIJKLMN", "recXYZXYZXYZXYZX"]
  }
}
```

### POST new outreach
```json
{
  "fields": {
    "Label": "Isovalent — Naga Ravi",
    "Opportunity": ["recABCDEFGHIJKLMN"],
    "Contact": ["recXYZXYZXYZXYZX"],
    "Channel": "Email",
    "Draft": "The LSM hook approach in KubeArmor's network policy enforcement...",
    "Status": "Drafted",
    "Follow-Up Status": "None Sent",
    "Notes": "Verify still at Red Hat before sending. Confirm PR#412 is the right reference."
  }
}
```

---

## Environment variables

Add these to `.env` (already in `.env.example`):
```
AIRTABLE_API_KEY=patXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
```

Get `AIRTABLE_API_KEY`: https://airtable.com/create/tokens
Required scopes: `data.records:read` · `data.records:write` · `schema.bases:read`

Get `AIRTABLE_BASE_ID`: Open your base → click Help → API documentation → the base ID is in the URL and at the top of the docs page (starts with `app`).

---

## Persistence layer verification

After setup, test the connection:

```bash
cd ~/Desktop/OAOS
npx tsx -e "
import { createPersistence } from './src/persistence/index.js';
const p = createPersistence();
p.findByFingerprint('test-fingerprint-does-not-exist')
  .then(r => console.log('Connection OK. Record found:', r))
  .catch(e => console.error('Error:', e.message));
"
```

Expected output: `Connection OK. Record found: null`

If you get a 422 error, the error message will name the field that doesn't match. Fix that field name in `src/persistence/config.ts` FIELD_NAMES. That file is the single place to fix any field name mismatch.

---

## Persistence layer bug to fix before live use

`src/persistence/records.ts` likely includes Total Score and Tier in the opportunity write payload (they are in the config). These are formula fields and Airtable will reject them.

Open `src/persistence/records.ts` and find the function that maps an Opportunity to Airtable fields. Remove these two lines from the write payload:
```typescript
// REMOVE THESE — formula fields, Airtable computes them automatically
[FIELD_NAMES.opportunities.total_score]: opportunity.score?.total,
[FIELD_NAMES.opportunities.tier]: opportunity.score?.tier,
```

Airtable will compute Total Score and Tier automatically from Quality Score and Match Score using the formulas defined in the table.
