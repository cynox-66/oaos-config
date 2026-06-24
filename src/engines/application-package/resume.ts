// resume.ts
// File: src/engines/application-package/resume.ts
// Purpose: Pure (no-LLM) resume-variant builder. Reorders and re-emphasizes
//          base-resume content to foreground experience matching the
//          opportunity's domain/tags and the matched evidence, pulling
//          matched-evidence-related projects to the top. It REORDERS only —
//          every bullet in the variant exists in the base (never invents,
//          never drops). Deterministic via a stable sort.

import type {
  BaseResume,
  Evidence,
  EvidenceMatch,
  ExperienceEntry,
  Opportunity,
  ProjectEntry,
} from "./types";

/**
 * The relevance vocabulary: opportunity domains ∪ matched-evidence tech_tags and
 * domains (resolved from the inventory). Lowercased for case-insensitive match.
 */
function relevanceSet(
  opportunity: Opportunity,
  match: EvidenceMatch,
  inventory: Evidence[]
): Set<string> {
  const set = new Set<string>();
  for (const d of opportunity.domain) set.add(d.toLowerCase());
  const byId = new Map(inventory.map((e) => [e.id, e]));
  for (const r of match.ranked) {
    const ev = byId.get(r.evidence_id);
    if (!ev) continue;
    for (const t of ev.tech_tags) set.add(t.toLowerCase());
    for (const d of ev.domains) set.add(d.toLowerCase());
  }
  return set;
}

/** Count of tags present in the relevance set. */
function scoreTags(tags: string[], rel: Set<string>): number {
  return tags.filter((t) => rel.has(t.toLowerCase())).length;
}

/** Count of relevance terms appearing in the text. */
function scoreText(text: string, rel: Set<string>): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const term of rel) if (lower.includes(term)) n++;
  return n;
}

/** Stable sort by score descending (ties preserve original order). */
function stableByScoreDesc<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, idx) => ({ item, idx, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.item);
}

function reorderBullets(bullets: string[], rel: Set<string>): string[] {
  return stableByScoreDesc([...bullets], (b) => scoreText(b, rel));
}

function reorderProject(p: ProjectEntry, rel: Set<string>): ProjectEntry {
  return { ...p, bullets: reorderBullets(p.bullets, rel) };
}

function reorderExperience(e: ExperienceEntry, rel: Set<string>): ExperienceEntry {
  return { ...e, bullets: reorderBullets(e.bullets, rel) };
}

/**
 * Build the resume variant: a reordered/re-emphasized copy of the base resume.
 * Pure and deterministic. Projects and experience entries are ranked by
 * relevance to the opportunity + matched evidence; bullets within each are
 * re-emphasized the same way. No content is invented or dropped.
 *
 * @param base the operator's base resume.
 * @param opportunity the target opportunity (domains drive relevance).
 * @param match the EvidenceMatch (its ranked ids resolve against `inventory`).
 * @param inventory the evidence inventory (resolves match ids → tags/domains).
 */
export function buildResumeVariant(
  base: BaseResume,
  opportunity: Opportunity,
  match: EvidenceMatch,
  inventory: Evidence[]
): BaseResume {
  const rel = relevanceSet(opportunity, match, inventory);

  const projects = stableByScoreDesc(
    base.projects.map((p) => reorderProject(p, rel)),
    (p) => scoreTags(p.tech_tags, rel)
  );

  const experience = stableByScoreDesc(
    base.experience.map((e) => reorderExperience(e, rel)),
    (e) => scoreText(`${e.title} ${e.bullets.join(" ")}`, rel)
  );

  return {
    name: base.name,
    summary: base.summary,
    experience,
    projects,
    education: [...base.education],
    skills: [...base.skills],
  };
}
