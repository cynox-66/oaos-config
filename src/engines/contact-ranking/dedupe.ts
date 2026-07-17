// dedupe.ts
// File: src/engines/contact-ranking/dedupe.ts
// Purpose: Deduplicate candidate contacts (GAP E). Merge on full normalized
//          name + company OR a shared github/linkedin handle; flag (and do NOT
//          merge) ambiguous identities — same first name + company but
//          different github handles. Pure and deterministic.

import type { CandidateContact, ContactRelationship } from "./types";

/** A merged cluster plus whether its identity is ambiguous. */
export interface DedupedCandidate {
  candidate: CandidateContact;
  identity_uncertain: boolean;
}

const RELATIONSHIP_STRENGTH: ContactRelationship[] = [
  "Met",
  "Warm",
  "GitHub Interaction",
  "Slack",
  "Cold",
];

// ============================================================
// Normalization helpers (pure)
// ============================================================

export function normalizeName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstName(name: string): string {
  return normalizeName(name).split(" ")[0] ?? "";
}

export function normalizeCompany(company: string): string {
  return (company ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a github handle from a username or profile URL. */
export function githubHandle(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .trim();
  return cleaned === "" ? null : cleaned;
}

/** Normalize a linkedin handle from a vanity name or profile URL. */
export function linkedinHandle(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
    .replace(/\/+$/, "")
    .trim();
  return cleaned === "" ? null : cleaned;
}

// ============================================================
// Pair predicates
// ============================================================

function mergeable(a: CandidateContact, b: CandidateContact): boolean {
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  const companyA = normalizeCompany(a.company);
  const companyB = normalizeCompany(b.company);
  if (nameA !== "" && nameA === nameB && companyA === companyB) return true;

  const ghA = githubHandle(a.channels.github);
  const ghB = githubHandle(b.channels.github);
  if (ghA && ghA === ghB) return true;

  const liA = linkedinHandle(a.channels.linkedin);
  const liB = linkedinHandle(b.channels.linkedin);
  if (liA && liA === liB) return true;

  return false;
}

function ambiguous(a: CandidateContact, b: CandidateContact): boolean {
  if (mergeable(a, b)) return false;
  const sameFirst = firstName(a.name) !== "" && firstName(a.name) === firstName(b.name);
  const sameCompany = normalizeCompany(a.company) === normalizeCompany(b.company);
  const ghA = githubHandle(a.channels.github);
  const ghB = githubHandle(b.channels.github);
  return sameFirst && sameCompany && !!ghA && !!ghB && ghA !== ghB;
}

// ============================================================
// Field-merge helpers
// ============================================================

function firstNonEmpty(values: (string | null)[]): string | null {
  for (const v of values) if (v && v.trim() !== "") return v;
  return null;
}

function longest(values: string[]): string {
  let best = "";
  for (const v of values) if (v.length > best.length) best = v;
  return best;
}

function strongestRelationship(values: ContactRelationship[]): ContactRelationship {
  let best = RELATIONSHIP_STRENGTH.length - 1; // Cold
  for (const v of values) {
    const rank = RELATIONSHIP_STRENGTH.indexOf(v);
    if (rank !== -1 && rank < best) best = rank;
  }
  return RELATIONSHIP_STRENGTH[best];
}

function mostRecent(dates: (string | null)[]): string | null {
  let bestStr: string | null = null;
  let bestMs = -Infinity;
  for (const d of dates) {
    if (!d) continue;
    const ms = Date.parse(d);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      bestStr = d;
    }
  }
  return bestStr;
}

/** Merge a cluster of candidates into one, keeping the strongest signals. */
function mergeCluster(members: CandidateContact[]): CandidateContact {
  return {
    name: longest(members.map((m) => m.name)),
    company: firstNonEmpty(members.map((m) => m.company)) ?? "",
    title: longest(members.map((m) => m.title)),
    channels: {
      github: firstNonEmpty(members.map((m) => m.channels.github)),
      email: firstNonEmpty(members.map((m) => m.channels.email)),
      linkedin: firstNonEmpty(members.map((m) => m.channels.linkedin)),
      slack: firstNonEmpty(members.map((m) => m.channels.slack)),
    },
    twitter: firstNonEmpty(members.map((m) => m.twitter)),
    blog: firstNonEmpty(members.map((m) => m.blog)),
    followers: Math.max(...members.map((m) => m.followers)),
    oss_overlap: firstNonEmpty(members.map((m) => m.oss_overlap)) ?? "",
    last_verified: mostRecent(members.map((m) => m.last_verified)),
    relationship: strongestRelationship(members.map((m) => m.relationship)),
    source: [...new Set(members.map((m) => m.source))].join(","),
    existing_record_id: firstNonEmpty(members.map((m) => m.existing_record_id ?? null)),
  };
}

// ============================================================
// Union-find clustering
// ============================================================

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

function union(parent: number[], a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
}

/**
 * Cluster candidates into deduplicated contacts. Merges per the mergeable rule;
 * flags `identity_uncertain` on clusters involved in an ambiguous pairing.
 */
export function dedupeCandidates(candidates: CandidateContact[]): DedupedCandidate[] {
  const n = candidates.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const uncertain = new Set<number>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (mergeable(candidates[i], candidates[j])) {
        union(parent, i, j);
      } else if (ambiguous(candidates[i], candidates[j])) {
        uncertain.add(i);
        uncertain.add(j);
      }
    }
  }

  // Group by root, preserving first-appearance order of roots.
  const order: number[] = [];
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(parent, i);
    if (!groups.has(root)) {
      groups.set(root, []);
      order.push(root);
    }
    groups.get(root)!.push(i);
  }

  return order.map((root) => {
    const memberIdx = groups.get(root)!;
    const members = memberIdx.map((i) => candidates[i]);
    return {
      candidate: mergeCluster(members),
      identity_uncertain: memberIdx.some((i) => uncertain.has(i)),
    };
  });
}
