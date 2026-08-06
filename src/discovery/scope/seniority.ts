// seniority.ts
// File: src/discovery/scope/seniority.ts
// Purpose: The seniority dimension's data and derivations. 100% pure — no I/O,
//          no network, no LLM. This module owns what a seniority level MEANS;
//          the orchestrator and the query_net sources are consumers only.
//
// ── The mechanism this feeds, and why it is blunt ───────────────────────────
// `seniorityNegativeTerms` output becomes `PrerankVocabulary.negativeTerms`,
// consumed at exactly one place (src/discovery/prerank/prerank.ts):
//
//     if (vocabulary.negativeTerms.some((term) => termPresent(text, term)))
//         → gated, reason "negative_term"
//
// Two properties of that line govern every term list below:
//
//  1. `text` is `extractText(item)` — EVERY string leaf of the item's payload,
//     including the full description body. It is NOT the title. So a term
//     matches prose that merely MENTIONS a level ("you'll partner with senior
//     engineers", "reports to the Engineering Manager") exactly as readily as a
//     title that IS that level.
//  2. It is the second hard gate, evaluated BEFORE scoring. There is no
//     relevance floor and no top-K to recover from — a hit is unconditional.
//
// Net: this is a blunt instrument and no term list makes it precise. The
// durable fix is a TITLE-SCOPED negative gate, which lives inside
// src/discovery/prerank/ and is deliberately out of scope. See
// docs/known-issues.md #23. Do not attempt to compensate by tuning the lists.
//
// ── Matching rules these terms must satisfy ─────────────────────────────────
// `termPresent` lowercases the term, collapses whitespace, REGEX-ESCAPES it
// (verified this wave: the escape class in prerank/text.ts includes "."), and
// wraps it in `(^|[^a-z0-9])…($|[^a-z0-9])`. Therefore:
//   - Terms are stored lowercase and whitespace-normalized. No escaping is done
//     here; doing so would double-escape at the consumer.
//   - "." is literal, so "sr." matches "Sr. Engineer" and NOT "sre" / "srv".
//   - "-" is a BOUNDARY character, so "staff engineer" does not match
//     "staff-engineer". Phrase variants are separate terms, never generated.
//   - Matching is contiguous: "staff engineer" does not match "staff software
//     engineer". Both are listed where both matter.

import type {
  SeniorityLevelId,
  SeniorityLevelSelection,
  SeniorityPreference,
} from "./types";

/** One level as config proposes it. `terms` is the expansion the operator confirms. */
export interface SeniorityLevelDefinition {
  id: SeniorityLevelId;
  /** Shown in `oaos setup-scope`. */
  label: string;
  terms: string[];
}

/**
 * The closed level set, with the exact term expansion each proposes.
 *
 * Every list below is deliberately narrow. A bare level word was rejected in
 * every case where it carries a non-seniority meaning, because a false gate is
 * invisible: the operator never sees the opportunity that was deleted.
 *
 * Terms REMOVED from a list here invalidate every preferences.json that
 * persisted them (by design — see SeniorityLevelSelection). Terms ADDED are
 * safe: they surface to the operator as available and are adopted only by an
 * explicit action.
 */
export const SENIORITY_LEVELS: readonly SeniorityLevelDefinition[] = [
  {
    id: "senior",
    label: "senior",
    // "senior" carries no non-seniority meaning in a posting, so it is included
    // despite being the term most likely to hit body prose.
    // Bare "sr" is REJECTED and this is specific to this operator's scope:
    // "-" is a boundary character, so "sr" MATCHES "sr-iov" — a live term in
    // the Networking and Infra fields. "sr." and "sr engineer" cover the real
    // title forms without that collision.
    terms: ["senior", "sr.", "sr engineer"],
  },
  {
    id: "staff",
    label: "staff",
    // Bare "staff" is REJECTED: "our staff", "staffing", "staff of 40" and
    // benefits boilerplate would gate on it. Both phrases are needed —
    // matching is contiguous, so neither implies the other.
    terms: ["staff engineer", "staff software engineer"],
  },
  {
    id: "principal",
    label: "principal",
    // Bare "principal" is REJECTED: "principal component", "principal
    // investigator", "principal amount".
    terms: ["principal engineer", "principal software engineer"],
  },
  {
    id: "lead",
    label: "lead",
    // The most ambiguous level. Bare "lead" is REJECTED emphatically: it is a
    // verb in nearly every IC posting ("lead the design of") and a sales noun
    // ("lead generation"). Even these phrases hit prose — "you will work
    // closely with the tech lead" appears in junior postings.
    terms: ["tech lead", "technical lead", "team lead", "lead engineer", "engineering lead"],
  },
  {
    id: "management",
    label: "management",
    // Bare "manager" / "director" are REJECTED as org-chart references.
    // "engineering manager" is kept despite carrying the highest prose risk of
    // any term proposed ("you will report to the Engineering Manager") — the
    // operator is told this at confirmation time rather than having it hidden.
    terms: [
      "engineering manager",
      "director of engineering",
      "head of engineering",
      "vp of engineering",
      "cto",
    ],
  },
];

/**
 * A years-of-experience level ("8+ years", "10+ years") was CONSIDERED AND NOT
 * BUILT. Real phrasing varies far too widely to enumerate ("minimum of 10
 * years", "10-12 years", "a decade of"), so any list would under-cover while
 * still over-gating. Under-proposing is the correct failure mode. Recorded so a
 * future session does not re-derive the question from scratch.
 */
export const REJECTED_LEVELS = ["experience_floor"] as const;

/** Every level id, in config order. */
export const SENIORITY_LEVEL_IDS: readonly SeniorityLevelId[] = SENIORITY_LEVELS.map((l) => l.id);

/**
 * The union of every level's terms — the membership set the validator checks a
 * persisted term against. Membership, not equality: config may gain terms
 * without invalidating existing files.
 */
export const ALL_SENIORITY_TERMS: readonly string[] = Array.from(
  new Set(SENIORITY_LEVELS.flatMap((level) => level.terms))
);

/** Look up a level definition by id. Null for an unknown id. */
export function seniorityLevel(id: string): SeniorityLevelDefinition | null {
  return SENIORITY_LEVELS.find((level) => level.id === id) ?? null;
}

/**
 * The negative terms a confirmed seniority dimension contributes to the prerank
 * vocabulary.
 *
 * Reads the PERSISTED terms, not the config expansion — the operator confirmed
 * those exact strings, and a later config edit must not change discovery
 * behaviour behind their back.
 *
 * Order is config level order (then the persisted order within a level), so
 * output is deterministic regardless of how the file happens to be written.
 * Normalized to lowercase + collapsed whitespace, empties dropped, deduped.
 */
export function seniorityNegativeTerms(seniority: SeniorityPreference): string[] {
  const byLevel = new Map<string, SeniorityLevelSelection>();
  for (const selection of seniority.levels) byLevel.set(selection.level, selection);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of SENIORITY_LEVEL_IDS) {
    const selection = byLevel.get(id);
    if (!selection || !selection.excluded) continue;
    for (const raw of selection.terms) {
      const term = raw.toLowerCase().replace(/\s+/g, " ").trim();
      if (term === "" || seen.has(term)) continue;
      seen.add(term);
      out.push(term);
    }
  }

  return out;
}

/**
 * The modifier appended to a query_net source's query string when the operator
 * has confirmed entry-level intent.
 *
 * One fixed string rather than a per-level derivation: these are free-text
 * search fields on third-party APIs whose term-combination semantics we do not
 * control, and every appended token narrows the result set multiplicatively.
 * Adzuna already appends " remote", so a modifier there makes a 3-clause query.
 */
export const ENTRY_LEVEL_MODIFIER = "entry level";

/** The modifier to append, or null when the operator has not confirmed it. */
export function entryLevelModifier(seniority: SeniorityPreference): string | null {
  return seniority.entry_level_query_modifier ? ENTRY_LEVEL_MODIFIER : null;
}
