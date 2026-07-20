# Discovery Scope

The operator-confirmed answer to *"what does automated discovery search for?"*
Derives a **proposed** field map from the operator's real profile artifacts, the
operator confirms / unticks / adds interactively, and the confirmed scope is
persisted to `preferences.json` — the single source of truth for the automated
discovery layer.

Implements **decision D15**. Phase 1, Wave 1.

**100% pure TypeScript in the module.** No LLM calls, no network, no Airtable.
The only I/O is reading/writing `preferences.json` (in `preferences.ts`) and the
CLI shell that reads lines from a terminal.

## The rule this module exists to enforce

> Discovery scope is user-confirmed at setup, never silently inferred.
> **The generator proposes; the operator disposes.**

Nothing here can confirm anything on the operator's behalf:

- `deriveScope` returns a `ScopeProposal`, **not** a `Preferences`. An
  unconfirmed scope is not representable as the persisted type.
- `buildPreferences` throws unless `state.status === "confirmed"`. It is the
  only constructor that can stamp `confirmed_at`.
- The CLI writes on exactly one path — the operator typing `done`.

## Inputs

All three are loaded through their existing strict loaders; this module
reimplements none of them.

| Artifact | Loader |
|---|---|
| `resume/base_resume.json` | `loadBaseResume` (`cli/resume.ts`) |
| `resume/operator_profile.json` | `loadOperatorProfile` (`cli/resume.ts`) |
| `evidence/inventory.md` | `loadInventory` (`src/engines/evidence-matching`) |

The field taxonomy is Engine 1's controlled domain vocabulary, imported
read-only from `src/engines/normalization/config.ts` (`DOMAIN_KEYWORDS`) so that
discovery scope and scoring stay aligned on **one** vocabulary. `"Other"` is
excluded by construction — it is a normalization catch-all, not a searchable
field. Never duplicate this list.

## Derivation rules

For each vocabulary term:

- `evidence_backed` — true iff ≥1 inventory asset's `domains[]` or `tech_tags[]`
  matches the term.
- **profile-matched** — the term appears in `base_resume.skills[]`,
  `base_resume.projects[].tech_tags[]`, or `operator_profile.stack[]`. This
  pre-ticks the field but does **not** set `evidence_backed`.
- Pre-ticked (`enabled: true`) iff evidence-backed **or** profile-matched.
  Everything else is listed but unticked, so the operator can see and tick it.

Matching is **exact normalized equality** — lowercase, trim, collapse
`[-_\s]+` to a single space, `/` preserved so `Web/Frontend` and `AI/ML` match
literally. There is **no fuzzy matching**: `"network"` does not match
`"Networking"`, and `"eBPF/LSM concepts"` does not match `"eBPF"`.

Under-proposing is the correct failure mode. A missed field costs one keystroke;
a substring rule that silently widened discovery scope would violate D15. On the
operator's real artifacts this means `eBPF` comes back unticked despite
`"eBPF/LSM"` in the profile — tick it manually.

Derivation is deterministic: identical inputs and `deps.now` produce a
deep-equal proposal.

## Re-runs

`oaos setup-scope` is re-runnable anytime. When `preferences.json` exists it is
loaded (strictly) and becomes the baseline rather than a fresh derivation:

- The operator's tick state is carried forward and **always wins** over the
  fresh proposal — a field they unticked stays unticked even after it becomes
  evidence-backed.
- Evidence backing is always recomputed from the current inventory, so
  `aspirational` is never carried over stale.
- Fields that gained backing since the last run come back in
  `proposal.newly_backed` and render as `<NEW EVIDENCE>`. Presentation only —
  never persisted.
- Operator-added custom terms are preserved, in order, after the vocabulary.

## Aspirational fields

An operator-added field with no supporting evidence is flagged
`aspirational: true`. Per D15 this is **not second-class** — discovery searches
it identically to an evidence-backed field. The flag exists so downstream
Match-score presentation stays honest about what the operator can prove.

```
aspirational === (origin === "operator_added" && !evidence_backed)
```

## The two locked literals

Both are encoded in the *types*, refused by the *reducer*, and rejected by the
*validator*:

| Field | Value | Why |
|---|---|---|
| `remote_only` | `true` | Locked charter decision. Present in the schema so the lock is explicit and machine-readable. |
| `work_types.freelance` | `false` | Freelance discovery is deferred by locked decision. The field exists so the deferral is explicit; flipping it later is a schema-compatible change, not a migration. |

A hand-edited file violating either is rejected loudly, naming the path.

## Validation philosophy

Strict on **read and write**, and never coercing — the same posture as
`cli/resume.ts`. A malformed scope throws `ScopeValidationError` naming the
exact offending path:

```
preferences.fields[2].aspirational: is false but origin="operator_added" with
evidence_backed=false requires true
```

Silently "fixing" a scope file would be silently *inferring* scope, which is the
one thing D15 forbids. Invariants enforced:

- `version === 1`; `generated_at` / `confirmed_at` parseable ISO-8601.
- `evidence_backed === (supporting_evidence_ids.length > 0)`.
- `aspirational` matches the D15 formula.
- No duplicate field names.
- Both locked literals.

`writePreferences` validates **before** touching disk, so a rejected write
leaves an existing file intact.

## Usage

```typescript
import {
  deriveScope, initialState, reduceScope, parseScopeCommand,
  buildPreferences, writePreferences, loadPreferences,
} from "./src/discovery/scope";

const proposal = deriveScope(
  { resume, profile, inventory, existing },   // existing is optional
  { now: new Date().toISOString() }
);

let state = initialState(proposal);
state = reduceScope(state, { kind: "toggle_field", name: "eBPF" });
state = reduceScope(state, { kind: "confirm" });

writePreferences("preferences.json", buildPreferences(state, {
  generated_at: proposal.generated_at,
  confirmed_at: new Date().toISOString(),
}));
```

## CLI

```
oaos setup-scope            interactive — derive, review, confirm, save
oaos setup-scope --show     print the current scope; no editing, no writes
```

Interactive commands: a field's number toggles it, `add <term>` adds a custom
field (backing computed live), `job`/`internship`/`oss` toggle work types,
`done` confirms and saves, `quit` aborts writing nothing, `help` re-prints.

`--show` with no `preferences.json` prints a pointer to `oaos setup-scope` and
exits non-zero.

## Reducer pattern

The interactive loop is a **pure state machine**; the CLI is a thin I/O shell:

```
read line → parseScopeCommand → (resolve evidence for `add`) → reduceScope → render
```

`reduceScope(state, action)` is pure, total (never throws), and non-mutating. An
action that cannot apply returns the state unchanged with an explanatory
`notice` — the loop never dead-ends and never silently ignores input. This is
why the entire decision surface is unit-testable without a TTY, including the
freelance-lock refusal.

`add` is parsed as a *command*, not an action: the shell resolves the term's
evidence backing against the in-memory inventory, then dispatches a fully-formed
`add_field` action. That keeps the inventory out of the reducer.

## Files

| File | Role |
|---|---|
| `types.ts` | Schema + reducer types. Locked literals encoded as literal types. |
| `config.ts` | `SCOPE_VOCABULARY` (imported from Engine 1), version, default path. |
| `generator.ts` | `deriveScope`, `computeBacking`, `normalizeTerm` — pure. |
| `preferences.ts` | Strict validator + loader/writer. |
| `reducer.ts` | `reduceScope`, `parseScopeCommand`, `buildPreferences` — pure. |
| `index.ts` | Public surface. |

## Not wired yet

`preferences.json` is written but not yet consumed. Wave 5/6 wires it into the
per-source query builders and swaps it in as the prerank gate's `vocabulary`
input (a one-line call-site change by design). Query-string construction for any
specific source is explicitly out of scope here — this module produces the
**source-agnostic** scope.
