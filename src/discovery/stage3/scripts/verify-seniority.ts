// verify-seniority.ts
// File: src/discovery/stage3/scripts/verify-seniority.ts
// Purpose: Bounded LIVE verification of the seniority dimension's two
//          consumption sites. Run manually:
//
//            npx tsx src/discovery/stage3/scripts/verify-seniority.ts v1
//            npx tsx src/discovery/stage3/scripts/verify-seniority.ts v2
//
// EXCLUSION MECHANISM (standing invariant, same as live-verify*.ts): this file
// is excluded from `vitest run` purely because its name does not match vitest's
// default test glob (`**/*.{test,spec}.*`). There is no vitest.config.ts. If one
// is ever added, this exclusion must be preserved explicitly — the default
// suite stays network-free forever.
//
// ── What this does NOT do ───────────────────────────────────────────────────
//  - It never writes preferences.json. It READS the operator's real confirmed
//    scope and, for the B-variant only, derives an IN-MEMORY copy. Nothing is
//    persisted. Precedent: `oneTermScope` in live-verify-wave5.ts.
//  - It never flips a source's `enabled` flag. Rows are selected the way
//    `--source <name>` selects them (see cli/commands/stage3.ts selectEntries),
//    which bypasses the family toggle for one invocation by design.
//  - It never persists health or calendar state, and never runs the pipeline:
//    every run here is `dryRun: true`, so zero Gemini budget is spent.
//
// ── Why it calls the REAL runStage3 twice ───────────────────────────────────
// Preranking one shared batch twice, in-script, would have been cheaper. It was
// rejected: it means re-implementing the orchestrator's fetch → dedupe →
// prerank sequence here, and then the thing being verified is the
// re-implementation, not the shipped path. Both V1 runs call the real
// `runStage3`, exactly as `oaos discover --stage3 --dry-run` does.
//
// ── Why V1's second run replays the first's bytes ───────────────────────────
// The A/B isolates ONE variable: the vocabulary. Two live fetches cannot
// promise that — a posting closing between them changes the corpus, and
// `Stage3RunSummary` exposes only COUNTS, so a membership change that leaves
// the count unchanged is invisible. Recording run A and replaying it into run B
// makes corpus identity true by construction instead of checked after the fact.
// V2 is different and MUST fetch twice: its whole point is that the two
// variants send different query strings.

import { normalize } from "../../../engines/normalization";
import type { RawItem } from "../../../engines/normalization/types";
import { prerank } from "../../prerank";
// Deep import: text.ts is not re-exported by prerank/index.ts. Read-only use of
// the gate's own matcher, so attribution cannot drift from the real decision.
import { cleanText, extractText, termPresent } from "../../prerank/text";
import { SENIORITY_LEVELS } from "../../scope/seniority";
import {
  createSourceDeps,
  preferencesToVocabulary,
  runStage3,
  STAGE3_SOURCES,
} from "../../orchestrator";
import type { HealthStore, SourceTableEntry, Stage3RunSummary } from "../../orchestrator/types";
import { DEFAULT_PREFERENCES_PATH, loadPreferences } from "../../scope";
import type { Preferences } from "../../scope/types";
import type { HttpResponse, SourceDeps, SourceHealthState } from "../types";

// ============================================================
// Injected fakes — nothing here touches disk
// ============================================================

function memoryHealth(): HealthStore {
  const states = new Map<string, SourceHealthState>();
  return {
    get: (name) => states.get(name),
    set: (name, state) => void states.set(name, state),
    all: () => [...states.values()],
    flush: () => {},
  };
}

const deps = {
  sourceDeps: createSourceDeps(),
  health: memoryHealth(),
  writeCalendar: () => ({ written: 0, refused: [] }),
  processItem: async () => {
    throw new Error("processItem must never be called — every run here is a dry run");
  },
  dryRun: true as const,
};

// ============================================================
// Record / replay transport
// ============================================================
//
// WHY THIS EXISTS (V1 only). The A/B is meant to isolate ONE variable: the
// vocabulary. Two live fetches cannot promise that — a posting closing between
// them changes the corpus, and `Stage3RunSummary` exposes only COUNTS, so a
// membership change with an unchanged count is invisible.
//
// So run A fetches live and RECORDS every response; run B and the enumeration
// pass REPLAY those exact bytes. The orchestrator, the adapter, the dedupe and
// prerank all run for real over real data — only the transport is replayed.
// Corpus identity is then true BY CONSTRUCTION rather than checked after the
// fact, and a drift warning that could stay silent is not needed at all.
//
// A replay miss THROWS. It never falls back to the network: a silent refetch
// would reintroduce exactly the drift this removes.

interface Recorder extends SourceDeps {
  responses: Map<string, HttpResponse>;
}

function recordingDeps(real: SourceDeps): Recorder {
  const responses = new Map<string, HttpResponse>();
  return {
    responses,
    now: real.now,
    httpGet: async (url, headers) => {
      const res = await real.httpGet(url, headers);
      responses.set(`GET ${url}`, res);
      return res;
    },
    httpPost: async (url, body, headers) => {
      const res = await real.httpPost(url, body, headers);
      responses.set(`POST ${url} ${JSON.stringify(body)}`, res);
      return res;
    },
  };
}

function replayDeps(recorder: Recorder): SourceDeps {
  const serve = (key: string): HttpResponse => {
    const hit = recorder.responses.get(key);
    if (!hit) {
      throw new Error(
        `replay miss for "${key}" — refusing to fall back to the network, which ` +
          `would reintroduce the corpus drift this replay exists to remove`
      );
    }
    return hit;
  };
  return {
    now: recorder.now,
    httpGet: async (url) => serve(`GET ${url}`),
    httpPost: async (url, body) => serve(`POST ${url} ${JSON.stringify(body)}`),
  };
}

/** Select one row the way `--source <name>` does: bypass the family toggle. */
function entry(name: string): SourceTableEntry {
  const row = STAGE3_SOURCES.find((e) => e.name === name);
  if (!row) throw new Error(`no source table row named "${name}"`);
  return { ...row, enabled: true };
}

// ============================================================
// In-memory scope variants — read-only, never written
// ============================================================

/** The operator's confirmed scope with every seniority exclusion cleared. */
function withoutExclusions(preferences: Preferences): Preferences {
  return {
    ...preferences,
    seniority: {
      ...preferences.seniority,
      levels: preferences.seniority.levels.map((l) => ({ ...l, excluded: false })),
    },
  };
}

/** The operator's confirmed scope with the entry-level query modifier forced on. */
function withModifier(preferences: Preferences, on: boolean): Preferences {
  return {
    ...preferences,
    seniority: { ...preferences.seniority, entry_level_query_modifier: on },
  };
}

// ============================================================
// Reporting
// ============================================================

function report(label: string, summary: Stage3RunSummary): void {
  console.log(`\n── ${label} ──`);
  for (const s of summary.sources) {
    console.log(
      `  ${s.name}: fetched ${s.fetched} · deduped ${s.deduped} · ` +
        `passed ${s.prerankPassed} · gated ${s.prerankGated} · status ${s.status}`
    );
    for (const e of s.errors) console.log(`    ! ${e}`);
  }
  if (summary.prerank) {
    const reasons = Object.entries(summary.prerank.gatedByReason)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${r} ${n}`)
      .join(", ");
    console.log(
      `  prerank: ${summary.prerank.total} in → ${summary.prerank.passed} passed, ` +
        `${summary.prerank.gated} gated (${reasons || "none"})`
    );
  }
}

/**
 * Name every item the confirmed vocabulary gates as `negative_term`.
 *
 * `runStage3` returns COUNTS, not the gated items, so this is a separate pass:
 * one direct fetch, the orchestrator's own fingerprint dedupe, then the real
 * `prerank`. It exists to ENUMERATE, not to measure — every number reported to
 * the operator comes from the two real runs above. Its prerank total is
 * cross-checked against run A's, and a divergence is printed rather than hidden
 * (it would mean the board changed between fetches).
 */
async function enumerateNegativeGated(
  preferences: Preferences,
  transport: SourceDeps,
  expectedTotal: number | null
): Promise<void> {
  const source = entry("greenhouse").build({ preferences });
  const fetched = await source.fetch(transport);

  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const item of fetched.items) {
    const fingerprint = normalize(item).fingerprint;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    items.push(item);
  }

  const vocabulary = preferencesToVocabulary(preferences);
  const result = prerank({ items, vocabulary });
  const gated = result.gated.filter((g) => g.reason === "negative_term");

  // Corpus identity is guaranteed by the replay, so a mismatch here CANNOT be
  // board drift: it means the orchestrator and this pass disagree about dedupe
  // over byte-identical responses. That is a real defect. Halt — reporting
  // attribution computed from a batch that disagrees with the measured run
  // would be presenting numbers whose provenance is already known to be broken.
  // Diagnosing it is explicitly NOT this wave's work.
  if (expectedTotal !== null && result.stats.total !== expectedTotal) {
    throw new Error(
      `DEDUPE DISAGREEMENT — STOPPING.\n` +
        `  enumeration deduped to ${result.stats.total}; run A deduped to ${expectedTotal}\n` +
        `  over BYTE-IDENTICAL recorded responses, so this is not board drift.\n` +
        `  The orchestrator's dedupe and this pass's dedupe disagree. Reported, not\n` +
        `  investigated: diagnosing it is out of scope for the seniority wave.`
    );
  }

  // Which term did the gate fire on? prerank short-circuits on the FIRST match
  // in vocabulary order, so `primary` is what actually decided this item.
  // `all` is every term that would have matched — reported because a single
  // primary can hide how broadly a level is firing.
  const levelOf = new Map<string, string>();
  for (const level of SENIORITY_LEVELS) for (const t of level.terms) levelOf.set(t, level.id);

  const primaryTally = new Map<string, number>();
  const anyTally = new Map<string, number>();
  const primaryByLevel = new Map<string, number>();
  const anyByLevel = new Map<string, number>();
  const rows: Array<{ company: string; role: string; primary: string; all: string[] }> = [];

  for (const g of gated) {
    const text = extractText(g.item);
    const all = vocabulary.negativeTerms.filter((t) => termPresent(text, t));
    const primary = all[0] ?? "(no term matched on re-check)";
    const opportunity = normalize(g.item);
    rows.push({
      company: opportunity.company || "(no company)",
      role: opportunity.role || "(no role)",
      primary,
      all,
    });

    primaryTally.set(primary, (primaryTally.get(primary) ?? 0) + 1);
    const pLevel = levelOf.get(primary) ?? "(unmapped)";
    primaryByLevel.set(pLevel, (primaryByLevel.get(pLevel) ?? 0) + 1);
    for (const t of new Set(all)) {
      anyTally.set(t, (anyTally.get(t) ?? 0) + 1);
      const l = levelOf.get(t) ?? "(unmapped)";
      anyByLevel.set(l, (anyByLevel.get(l) ?? 0) + 1);
    }
  }
  // A level is counted once per item even if two of its terms matched.
  for (const [level] of anyByLevel) {
    const n = gated.filter((g) => {
      const text = extractText(g.item);
      return SENIORITY_LEVELS.find((l) => l.id === level)?.terms.some((t) =>
        vocabulary.negativeTerms.includes(t) && termPresent(text, t)
      );
    }).length;
    anyByLevel.set(level, n);
  }

  console.log(`\n── Items gated by negative_term (${gated.length}) ──`);
  if (gated.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const r of rows) {
    const extra = r.all.length > 1 ? `  [also: ${r.all.slice(1).join(", ")}]` : "";
    console.log(`  [${r.primary}] ${r.company} — ${r.role}${extra}`);
  }

  const table = (title: string, tally: Map<string, number>, note: string): void => {
    console.log(`\n  ${title}  (${note})`);
    for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${k}`);
    }
  };

  table("Per-term — deciding match", primaryTally, "sums to the gated count");
  table("Per-term — any match", anyTally, "items may appear under several terms");
  table("Per-level — deciding match", primaryByLevel, "sums to the gated count");
  table("Per-level — any match", anyByLevel, "items may appear under several levels");
}

// ============================================================
// V1 — A1 in isolation (greenhouse)
// ============================================================

async function v1(preferences: Preferences): Promise<void> {
  const excluded = preferences.seniority.levels.filter((l) => l.excluded);
  console.log(
    `\nConfirmed seniority exclusions: ${
      excluded.map((l) => l.level).join(", ") || "(NONE — the A/B below is degenerate)"
    }`
  );
  for (const level of excluded) console.log(`  ${level.level}: ${level.terms.join(", ")}`);

  const shared = { ...deps, entries: [entry("greenhouse")], buildContext: { preferences } };

  // Run A fetches live and records. Run B and the enumeration replay those exact
  // bytes, so the ONLY difference between A and B is the vocabulary.
  const recorder = recordingDeps(deps.sourceDeps);

  const a = await runStage3({
    ...shared,
    sourceDeps: recorder,
    vocabulary: preferencesToVocabulary(preferences),
  });
  report("A — as confirmed (exclusions active)", a);
  console.log(`  [recorded ${recorder.responses.size} live responses; A is the only live fetch]`);

  const replay = replayDeps(recorder);
  const b = await runStage3({
    ...shared,
    sourceDeps: replay,
    health: memoryHealth(),
    vocabulary: preferencesToVocabulary(withoutExclusions(preferences)),
  });
  report("B — control (all levels un-excluded, replayed corpus)", b);

  await enumerateNegativeGated(preferences, replay, a.prerank?.total ?? null);

  console.log(
    "\nNOTE: the passed-set delta is NOT purely attributable to negative_term.\n" +
      "Prerank's IDF is computed over the run's batch, so gating items changes\n" +
      "denominators and shifts survivors' scores across below_floor and beyond_k."
  );
}

// ============================================================
// V3 — passed-set diff over one held corpus
// ============================================================
//
// Answers what `Stage3RunSummary` cannot: WHICH items pass, not how many. One
// live fetch, the orchestrator's dedupe, then the real `prerank` twice over the
// SAME held batch — so A and B differ only in vocabulary, as in V1.

interface Row {
  fingerprint: string;
  company: string;
  role: string;
}

function describe(item: RawItem): Row {
  const o = normalize(item);
  return {
    fingerprint: o.fingerprint,
    company: o.company || "(no company)",
    role: o.role || "(no role)",
  };
}

async function v3(preferences: Preferences): Promise<void> {
  const source = entry("greenhouse").build({ preferences });
  const fetched = await source.fetch(deps.sourceDeps);

  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const item of fetched.items) {
    const fingerprint = normalize(item).fingerprint;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    items.push(item);
  }
  console.log(`\nCorpus: ${fetched.items.length} fetched → ${items.length} deduped (one live fetch)`);

  const vocabA = preferencesToVocabulary(preferences);
  const vocabB = preferencesToVocabulary(withoutExclusions(preferences));
  const a = prerank({ items, vocabulary: vocabA });
  const b = prerank({ items, vocabulary: vocabB });

  const aPassed = a.passed.map(describe);
  const bPassed = b.passed.map(describe);
  const aKeys = new Set(aPassed.map((r) => r.fingerprint));
  const bKeys = new Set(bPassed.map((r) => r.fingerprint));

  const show = (title: string, rows: Row[]): void => {
    console.log(`\n── ${title} (${rows.length}) ──`);
    for (const r of rows) console.log(`  ${r.company} — ${r.role}`);
  };

  show("A passed — exclusions active", aPassed);
  show("B passed — control, un-excluded", bPassed);
  show(
    "Entered the passed 25 under A but NOT under B (promoted by the gate)",
    aPassed.filter((r) => !bKeys.has(r.fingerprint))
  );
  show(
    "In B's passed 25 but NOT in A's (displaced)",
    bPassed.filter((r) => !aKeys.has(r.fingerprint))
  );

  // ── The decisive number ───────────────────────────────────────────────────
  // Of everything A's negative-term gate deleted, how much would the operator
  // actually have SEEN under the control? Anything beyond this count was going
  // to be dropped by below_floor / beyond_k regardless.
  const negGated = a.gated.filter((g) => g.reason === "negative_term");
  const negKeys = new Map(negGated.map((g) => [normalize(g.item).fingerprint, g.item]));
  const lostFromControl = bPassed.filter((r) => negKeys.has(r.fingerprint));

  console.log(
    `\n── DECISIVE: negative_term-gated items that were in the CONTROL passed 25 ──`
  );
  console.log(
    `  ${lostFromControl.length} of ${negGated.length} gated items would have been visible under B.`
  );
  for (const r of lostFromControl) console.log(`    ${r.company} — ${r.role}`);

  // ── Mechanical title-vs-body attribution ──────────────────────────────────
  let inTitle = 0;
  const bodyOnly: Array<Row & { term: string }> = [];
  for (const g of negGated) {
    const text = extractText(g.item);
    const term = vocabA.negativeTerms.find((t) => termPresent(text, t)) ?? "";
    const row = describe(g.item);
    if (termPresent(cleanText(row.role), term)) inTitle += 1;
    else bodyOnly.push({ ...row, term });
  }
  console.log(`\n── Deciding term: title vs body (${negGated.length} gated) ──`);
  console.log(`  in the title: ${inTitle}`);
  console.log(`  body only   : ${bodyOnly.length}`);
  for (const r of bodyOnly) console.log(`    [${r.term}] ${r.company} — ${r.role}`);

  // ── Chainguard internship ─────────────────────────────────────────────────
  const fate = (item: RawItem | undefined, result: typeof a): string => {
    if (!item) return "absent";
    const key = normalize(item).fingerprint;
    if (result.passed.some((p) => normalize(p).fingerprint === key)) return "PASSED";
    const g = result.gated.find((x) => normalize(x.item).fingerprint === key);
    return g ? `gated (${g.reason})` : "unaccounted";
  };
  const internAll = fetched.items.filter((i) => /internship|intern\b/i.test(describe(i).role));
  console.log(`\n── Internship postings in the fetched board (${internAll.length}) ──`);
  if (internAll.length === 0) console.log("  none — no internship posting is on these four boards");
  for (const item of internAll) {
    const r = describe(item);
    const deduped = items.find((i) => normalize(i).fingerprint === r.fingerprint);
    console.log(
      `  ${r.company} — ${r.role}\n` +
        `      A: ${fate(deduped, a)}   B: ${fate(deduped, b)}` +
        (deduped ? "" : "   (dropped as a within-run duplicate)")
    );
  }
}

// ============================================================
// V2 — A3 probe (himalayas)
// ============================================================

async function v2(preferences: Preferences): Promise<void> {
  const shared = { ...deps, entries: [entry("himalayas")], vocabulary: preferencesToVocabulary(preferences) };

  const off = await runStage3({
    ...shared,
    buildContext: { preferences: withModifier(preferences, false) },
  });
  report("A — without the entry-level modifier", off);

  const on = await runStage3({
    ...shared,
    health: memoryHealth(),
    buildContext: { preferences: withModifier(preferences, true) },
  });
  report("B — with the entry-level modifier", on);

  const before = off.sources[0]?.fetched ?? 0;
  const after = on.sources[0]?.fetched ?? 0;
  console.log(
    `\nCollapse: ${before} fetched → ${after} fetched ` +
      `(${before === 0 ? "n/a" : `${Math.round((after / before) * 100)}% retained`})`
  );
}

// ============================================================
// Entry point
// ============================================================

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "v1" && mode !== "v2" && mode !== "v3") {
    console.error("usage: verify-seniority.ts <v1|v2|v3>");
    process.exitCode = 1;
    return;
  }

  // Read-only. A v1 file stops here with the migration message, which is
  // itself the correct outcome to observe.
  const preferences = loadPreferences(DEFAULT_PREFERENCES_PATH);
  console.log(`Loaded ${DEFAULT_PREFERENCES_PATH} (v${preferences.version}) — read-only.`);

  if (mode === "v1") await v1(preferences);
  else if (mode === "v2") await v2(preferences);
  else await v3(preferences);
}

void main().catch((err) => {
  // A v1 preferences.json stops here with the migration message. That is a
  // correct outcome to observe, not a crash — print it plainly.
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
