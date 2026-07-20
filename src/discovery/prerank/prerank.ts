// prerank.ts
// File: src/discovery/prerank/prerank.ts
// Purpose: The Prerank Gate. A pure lexical pre-filter selecting top-K items
//          from a Stage-3 discovery batch for the Gemini-powered pipeline.
//          Gated items are always returned with a reason — nothing is ever
//          silently discarded.
//
// Approach reference: jobsync's greenhouse/rank.ts (MIT). Idea borrowed; this
// is fresh code. See README.md.

import { DEFAULT_PRERANK_CONFIG, MIN_TEXT_CHARS, ONSITE_PATTERNS, REMOTE_PATTERNS } from "./config";
import { extractText, matchedTerms, termPresent } from "./text";
import type {
  GateReason,
  GatedItem,
  PrerankConfig,
  PrerankDeps,
  PrerankRequest,
  PrerankResult,
  PrerankVocabulary,
} from "./types";
import type { RawItem } from "../../engines/normalization/types";

const ALL_REASONS: GateReason[] = [
  "insufficient_text",
  "negative_term",
  "location",
  "below_floor",
  "beyond_k",
];

/** Per-item working state, internal to one run. */
interface Candidate {
  item: RawItem;
  index: number;
  text: string;
  score: number;
}

/** Union of domain + role terms, lowercased and deduplicated, order preserved. */
function vocabularyTerms(vocabulary: PrerankVocabulary): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...vocabulary.domainTerms, ...vocabulary.roleTerms]) {
    const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Onsite-indicating text with no remote marker anywhere. Deliberately
 * conservative: ambiguous items pass, because a false positive here loses a
 * real opportunity while a false negative only leaks a little Gemini budget.
 */
function isOnsiteOnly(text: string): boolean {
  const onsite = ONSITE_PATTERNS.some((pattern) => termPresent(text, pattern));
  if (!onsite) return false;
  return !REMOTE_PATTERNS.some((pattern) => termPresent(text, pattern));
}

/** Newest-first ordering; unparseable timestamps sort last. */
function fetchedAtMillis(item: RawItem): number {
  const parsed = Date.parse(item.fetched_at);
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

/** Trim float noise so repeated runs are byte-identical when serialized. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Run the prerank gate over one discovery batch.
 *
 * This is the wiring point the Stage-3 batch path calls: everything in
 * `passed` proceeds to normalize() + runPipeline(); everything in `gated` is
 * persisted un-analyzed with its reason.
 *
 * @throws if the accounting invariant (passed + gated === items) is violated.
 */
export function prerank(request: PrerankRequest, deps: PrerankDeps = {}): PrerankResult {
  const now = deps.now ?? (() => new Date().toISOString());
  const config: PrerankConfig = { ...DEFAULT_PRERANK_CONFIG, ...request.config };
  const { items, vocabulary } = request;

  const terms = vocabularyTerms(vocabulary);
  const texts = items.map(extractText);

  // ---- 1. Hard gates (cheap, run first, order matters) -------------------
  const preScoreGated: GatedItem[] = [];
  const survivors: Candidate[] = [];

  items.forEach((item, index) => {
    const text = texts[index];
    if (text.length < MIN_TEXT_CHARS) {
      preScoreGated.push({ item, reason: "insufficient_text", score: null });
      return;
    }
    if (vocabulary.negativeTerms.some((term) => termPresent(text, term))) {
      preScoreGated.push({ item, reason: "negative_term", score: null });
      return;
    }
    if (config.remoteOnly && isOnsiteOnly(text)) {
      preScoreGated.push({ item, reason: "location", score: null });
      return;
    }
    survivors.push({ item, index, text, score: 0 });
  });

  // ---- 2. Lexical relevance, IDF-weighted against this run's corpus ------
  // Corpus is the full `items` batch (gated items included), so a term's
  // discriminative power reflects the batch as fetched.
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    let df = 0;
    for (const text of texts) if (termPresent(text, term)) df += 1;
    documentFrequency.set(term, df);
  }

  const corpusSize = items.length;
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = documentFrequency.get(term) ?? 0;
    // ln((N+1)/(df+1)): exactly 0 when a term appears in every item, always >= 0.
    idf.set(term, Math.log((corpusSize + 1) / (df + 1)));
  }

  const presentTerms = terms.filter((term) => (documentFrequency.get(term) ?? 0) > 0);
  const maxAchievable = presentTerms.reduce((sum, term) => sum + (idf.get(term) ?? 0), 0);

  for (const candidate of survivors) {
    const matches = matchedTerms(candidate.text, terms);
    if (maxAchievable > 0) {
      const raw = matches.reduce((sum, term) => sum + (idf.get(term) ?? 0), 0);
      candidate.score = round(raw / maxAchievable);
    } else if (presentTerms.length > 0) {
      // Homogeneous batch: every matched term appears in every item, so all
      // IDF weights collapse to 0. Falling back to plain overlap keeps a
      // fully-relevant batch (e.g. one company's board) from being gated out
      // wholesale. Only a genuine zero-match batch scores 0 below.
      candidate.score = round(matches.length / presentTerms.length);
    } else {
      candidate.score = 0;
    }
  }

  // ---- 3. Relevance floor ------------------------------------------------
  const aboveFloor: Candidate[] = [];
  const belowFloor: GatedItem[] = [];
  for (const candidate of survivors) {
    if (candidate.score < config.relevanceFloor) {
      belowFloor.push({ item: candidate.item, reason: "below_floor", score: candidate.score });
    } else {
      aboveFloor.push(candidate);
    }
  }

  // ---- 4. Top-K selection (score desc, recency tiebreak) -----------------
  const ranked = [...aboveFloor].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const recency = fetchedAtMillis(b.item) - fetchedAtMillis(a.item);
    if (recency !== 0) return recency;
    return a.index - b.index;
  });

  const passed = ranked.slice(0, Math.max(0, config.maxPerRun)).map((c) => c.item);
  const beyondK: GatedItem[] = ranked
    .slice(Math.max(0, config.maxPerRun))
    .map((c) => ({ item: c.item, reason: "beyond_k" as const, score: c.score }));

  const gated: GatedItem[] = [...preScoreGated, ...belowFloor, ...beyondK];

  // ---- 5. Accounting invariant ------------------------------------------
  if (passed.length + gated.length !== items.length) {
    throw new Error(
      `prerank accounting invariant violated: passed=${passed.length} + ` +
        `gated=${gated.length} !== items=${items.length}`,
    );
  }

  const gatedByReason: Record<string, number> = {};
  for (const reason of ALL_REASONS) gatedByReason[reason] = 0;
  for (const entry of gated) gatedByReason[entry.reason] += 1;

  return {
    passed,
    gated,
    stats: {
      total: items.length,
      passed: passed.length,
      gated: gated.length,
      gatedByReason,
      runTimestamp: now(),
    },
  };
}
