// rank.ts
// File: src/engines/contact-ranking/rank.ts
// Purpose: Core of the Contact Discovery & Ranking Engine (Engine 5):
//          reachability / role_relevance / seniority scoring, ranking, the
//          recruiter-aware primary selection, and the public rankContacts entry
//          point. Pure, synchronous, deterministic — no LLM, no network.

import { sha1 } from "../normalization/fingerprint";
import type {
  CandidateContact,
  Contact,
  DiscoveryRequest,
  Opportunity,
  RankOptions,
  RankedContacts,
  Seniority,
} from "./types";
import {
  ADJACENT_KEYWORDS,
  CORE_KEYWORDS_BY_DOMAIN,
  ENGINEER_KEYWORDS,
  FOLLOWERS_THRESHOLD,
  MAINTAINER_KEYWORDS,
  MS_PER_MONTH,
  REACHABILITY_BASE,
  REACHABILITY_DIRECT_CHANNEL,
  REACHABILITY_FOLLOWERS,
  REACHABILITY_MAX,
  REACHABILITY_MIN,
  REACHABILITY_SOCIAL,
  RECRUITER_KEYWORDS,
  ROLE_RELEVANCE,
  SENIORITY_DEFAULT,
  SENIORITY_KEYWORDS,
  SENIORITY_ORDER,
  STALE_MONTHS,
  UNRELATED_KEYWORDS,
} from "./config";
import { dedupeCandidates, githubHandle, linkedinHandle, normalizeCompany, normalizeName } from "./dedupe";
import { fromGithubScan, fromManual } from "./adapters";

// ============================================================
// Reachability (spec Logic step 2 + GAP D)
// ============================================================

function isStale(lastVerified: string | null, nowMs: number): boolean {
  if (!lastVerified) return false;
  const ms = Date.parse(lastVerified);
  if (Number.isNaN(ms)) return false;
  return nowMs - ms > STALE_MONTHS * MS_PER_MONTH;
}

/**
 * reachability (1..5): base + single direct/email channel + twitter|blog +
 * followers>100, capped at 5, THEN −1 if last_verified is stale (floor 1).
 */
export function computeReachability(candidate: CandidateContact, nowMs: number): number {
  let score = REACHABILITY_BASE;
  const hasDirect = !!(candidate.channels.email || candidate.channels.github || candidate.channels.slack);
  if (hasDirect) score += REACHABILITY_DIRECT_CHANNEL;
  if (candidate.twitter || candidate.blog) score += REACHABILITY_SOCIAL;
  if (candidate.followers > FOLLOWERS_THRESHOLD) score += REACHABILITY_FOLLOWERS;

  score = Math.min(score, REACHABILITY_MAX);
  if (isStale(candidate.last_verified, nowMs)) score = Math.max(score - 1, REACHABILITY_MIN);
  return score;
}

// ============================================================
// role_relevance (spec Logic step 3 + GAP C)
// ============================================================

function matchesAny(title: string, keywords: string[]): boolean {
  return keywords.some((k) => title.includes(k));
}

function relevanceForDomain(title: string, domain: string): number {
  const t = title.toLowerCase();
  if (matchesAny(t, RECRUITER_KEYWORDS)) return ROLE_RELEVANCE.RECRUITER;
  if (matchesAny(t, UNRELATED_KEYWORDS)) return ROLE_RELEVANCE.UNRELATED;
  if (matchesAny(t, MAINTAINER_KEYWORDS)) return ROLE_RELEVANCE.CORE;
  if (matchesAny(t, CORE_KEYWORDS_BY_DOMAIN[domain] ?? [])) return ROLE_RELEVANCE.CORE;
  if (matchesAny(t, ADJACENT_KEYWORDS)) return ROLE_RELEVANCE.ADJACENT;
  if (matchesAny(t, ENGINEER_KEYWORDS)) return ROLE_RELEVANCE.ENGINEER;
  return ROLE_RELEVANCE.FALLBACK;
}

/** role_relevance = max relevance across the opportunity's domains; empty → fallback. */
export function computeRoleRelevance(title: string, domains: readonly string[]): number {
  if (domains.length === 0) return ROLE_RELEVANCE.FALLBACK;
  return Math.max(...domains.map((d) => relevanceForDomain(title, d)));
}

// ============================================================
// Seniority (spec Logic step 4 + GAP F)
// ============================================================

/** Map a title to a seniority tier; first keyword rule wins, else Mid. */
export function computeSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  for (const { seniority, keywords } of SENIORITY_KEYWORDS) {
    if (matchesAny(t, keywords)) return seniority;
  }
  return SENIORITY_DEFAULT;
}

function seniorityRank(seniority: Seniority): number {
  const i = SENIORITY_ORDER.indexOf(seniority);
  return i === -1 ? SENIORITY_ORDER.length : i;
}

// ============================================================
// Contact assembly + ranking
// ============================================================

function contactId(candidate: CandidateContact): string {
  const key = [
    normalizeName(candidate.name),
    normalizeCompany(candidate.company),
    githubHandle(candidate.channels.github) ?? "",
    linkedinHandle(candidate.channels.linkedin) ?? "",
  ].join("|");
  return `contact_${sha1(key).slice(0, 12)}`;
}

/** Rank comparator: role_relevance desc → reachability desc → seniority → id. */
function byRank(a: Contact, b: Contact): number {
  if (a.role_relevance !== b.role_relevance) return b.role_relevance - a.role_relevance;
  if (a.reachability !== b.reachability) return b.reachability - a.reachability;
  const sa = seniorityRank(a.seniority);
  const sb = seniorityRank(b.seniority);
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** primary = first non-recruiter in rank order; else top recruiter; else null. */
function selectPrimary(ordered: Contact[]): string | null {
  if (ordered.length === 0) return null;
  const nonRecruiter = ordered.find((c) => c.seniority !== "Recruiter");
  return (nonRecruiter ?? ordered[0]).id;
}

function resolveNowMs(now: RankOptions["now"]): number {
  if (now === undefined) return Date.now();
  return now instanceof Date ? now.getTime() : Date.parse(now);
}

/**
 * Discover, dedupe, score, and rank the contacts for an opportunity. Pure and
 * deterministic given a fixed clock; never fetches anything.
 *
 * @param request the opportunity plus pre-fetched candidate source arrays.
 * @param options.now reference clock for the last_verified staleness check.
 */
export function rankContacts(request: DiscoveryRequest, options: RankOptions = {}): RankedContacts {
  const nowMs = resolveNowMs(options.now);
  const { opportunity } = request;

  const candidates: CandidateContact[] = [
    ...(request.githubScan ?? []).map(fromGithubScan),
    ...(request.manual ?? []).map(fromManual),
  ];

  const deduped = dedupeCandidates(candidates);

  const contacts: Contact[] = deduped.map((d): Contact => {
    const c = d.candidate;
    return {
      id: contactId(c),
      name: c.name,
      company: c.company,
      title: c.title,
      seniority: computeSeniority(c.title),
      channels: c.channels,
      reachability: computeReachability(c, nowMs),
      role_relevance: computeRoleRelevance(c.title, (opportunity as { domain: string[] }).domain),
      oss_overlap: c.oss_overlap,
      last_verified: c.last_verified,
      primary: false,
      relationship: c.relationship,
      identity_uncertain: d.identity_uncertain,
      existing_record_id: c.existing_record_id ?? null,
    };
  });

  const ordered = [...contacts].sort(byRank);
  const primary_contact_id = selectPrimary(ordered);
  for (const c of ordered) c.primary = c.id === primary_contact_id;

  return {
    opportunity_id: opportunity.id,
    ordered,
    primary_contact_id,
  };
}
