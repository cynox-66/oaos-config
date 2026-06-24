# Opportunity Normalization Engine (Engine 1)

Converts heterogeneous source items (job posts, freelance listings, OSS programs,
funding signals, manual pastes) into one canonical `Opportunity` record so every
downstream engine reads a single schema. It is **pure, deterministic, and
side-effect-free**: no network calls, no file I/O, no LLM calls. Source-specific
code lives only in adapters; everything else (description cleaning, compensation
normalization to INR, domain derivation, fingerprinting, completeness, dedupe
merge) is source-agnostic.

## The `Opportunity` schema

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Generated, deterministic (derived from input). |
| `company` | `string` | May be empty when unknown. |
| `role` | `string` | May be empty when unknown. |
| `category` | `Job \| Internship \| Freelance \| Startup \| OSS \| Other` | Adapter-set or inferred. |
| `domain` | `Domain[]` | Controlled vocab, multi-assign, may be empty. |
| `source_name` | `string` | e.g. `"wellfound"`, `"manual"`. |
| `source_type` | `job_board \| internship \| freelance \| startup_signal \| network \| oss` | |
| `url` | `string \| null` | Nullable. |
| `description_raw` | `string` | Trimmed, max 5000 chars. |
| `description_norm` | `string` | HTML-stripped, boilerplate-removed, whitespace-collapsed. |
| `comp_min` / `comp_max` | `number \| null` | INR/month or INR/project. Null unless basis is monthly/hourly/project. |
| `comp_basis` | `monthly \| hourly \| project \| equity \| unpaid \| unknown` | Original basis. |
| `remote` | `remote \| hybrid \| onsite \| unknown` | |
| `location` | `string \| null` | Nullable. |
| `date_found` | `string` | ISO date (`YYYY-MM-DD`). |
| `fingerprint` | `string` | `sha1(company \| role \| url-host)` dedupe key. |
| `status` | `"Discovered"` | Always initial. |
| `completeness` | `number` | `present_core_fields / 6`, 0..1. |
| `needs_enrichment` | `boolean` | `true` when `completeness < 0.4`. |
| `also_seen_in` | `string[]` | `source_name`s of duplicate sightings (set by `merge`). |

Controlled `Domain` vocabulary: `Cloud-Native, Kubernetes, Security, eBPF,
Chaos-Engineering, Networking, DevTools, Infra, Observability, Web/Frontend,
Backend, Data, AI/ML, Other`.

## Public API

```ts
import { normalize, merge } from "./index";

// RawItem → Opportunity (pure).
const opp = normalize(rawItem);

// Dedupe: fold a same-fingerprint sighting into the stored record (pure).
const updated = merge(existing, incoming);
```

`normalize` has no knowledge of duplicates and never touches a store. Dedupe is
the caller's responsibility: look up `incoming.fingerprint` in your store; if a
record exists, call `merge(existing, incoming)` and write the result; otherwise
insert. `merge` updates `date_found` only when the incoming source is
higher-signal (manual > automated) and appends the incoming `source_name` to
`also_seen_in`.

## Adding a new source adapter

1. Implement the `SourceAdapter` interface (`name`, `matches`, `extract`) in a
   new file under `adapters/`. `extract` returns an `AdapterOutput` (the fields
   it can map; leave `category` null to let the engine infer it, and surface a
   free-text `comp_raw` for source-agnostic compensation parsing).
2. Register it in `adapters/index.ts` **before** `jobBoardAdapter` (the
   catch-all fallback, which must stay last). First match wins.
3. Add ≥10 labeled fixtures under `tests/fixtures/` and wire them into
   `tests/fixtures.test.ts`.

No other module should need changes — adapters are the only source-specific code.

## Running tests

```bash
npm test        # vitest run
```

Coverage: schema validity (100% of outputs), fingerprint determinism, labeled
fixtures (≥90% category + ≥1 domain per adapter), compensation normalization,
completeness/needs_enrichment, dedupe/merge, and the spec edge cases (duplicate
fingerprint, equity-only comp, manual paste with no URL, non-English
pass-through, unparseable comp).
