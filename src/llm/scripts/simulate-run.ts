// simulate-run.ts
// File: src/llm/scripts/simulate-run.ts
// Purpose: Answer the operator's question — "does a real Stage-3 run now take
//          2 minutes or 20?" — WITHOUT making a single live Gemini call.
//
// Runs the REAL throttle (src/llm/throttle.ts) against a fake clock and a fake
// call, driving it with the actual per-opportunity call pattern the pipeline
// produces, and reports measured virtual wall-clock.
//
// EXCLUDED FROM `vitest run` by filename: vitest's default glob is
// `**/*.{test,spec}.*` and there is no vitest.config.ts to special-case. Same
// convention as Wave 3/4's live-verify scripts. Unlike those, this one touches
// NO network at all — it is a simulation, not a probe.
//
// Run: npx tsx src/llm/scripts/simulate-run.ts [items] [rpm] [429-rate]

import { createThrottle } from "../throttle";
import { createStats } from "../stats";
import { resolveThrottleConfig, THROTTLE_DEFAULTS } from "../config";
import { HttpStatusError } from "../types";
import type { Clock } from "../types";

// ============================================================
// Virtual time
// ============================================================

function simClock(): Clock & { current(): number } {
  let t = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  let queued = false;

  function pump(): void {
    queued = false;
    if (timers.length === 0) return;
    timers.sort((a, b) => a.at - b.at);
    const next = timers.shift()!;
    t = Math.max(t, next.at);
    next.resolve();
    schedule();
  }
  function schedule(): void {
    if (queued) return;
    queued = true;
    setTimeout(pump, 0);
  }

  return {
    now: () => t,
    sleep(ms: number) {
      if (ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        timers.push({ at: t + ms, resolve });
        schedule();
      });
    },
    current: () => t,
  };
}

/** Deterministic PRNG so the reported numbers are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// The call pattern one opportunity actually produces
// ============================================================

/**
 * Derived by reading the call sites, not assumed:
 *
 *   research.ts        1 call — the company profile.
 *   score.ts:328-336   1 call, PLUS a second stricter re-prompt when the first
 *                      response doesn't parse as valid JSON.
 *   match.ts:310-317   1 call per ranked evidence asset (1-3 of them), PLUS a
 *                      stricter re-prompt per asset when the first reason trips
 *                      the fabrication check.
 *
 * So the floor is 3 (1 asset, no re-prompts) and the ceiling is 9 (3 assets,
 * everything re-prompted); the common case is 5-6. That spread is what decides
 * whether a run is 8 minutes or 12, so the simulation draws it rather than
 * multiplying by a constant.
 */
const P_SCORING_REPROMPT = 0.1;
const P_FABRICATION_REPROMPT = 0.1;
const ASSET_WEIGHTS: [number, number][] = [
  [1, 0.1],
  [2, 0.2],
  [3, 0.7],
];

/** Typical flash-lite response time. Absorbed by pacing when < the interval. */
const API_LATENCY_MS = 1_500;

function drawAssetCount(rand: () => number): number {
  const r = rand();
  let acc = 0;
  for (const [count, weight] of ASSET_WEIGHTS) {
    acc += weight;
    if (r < acc) return count;
  }
  return 3;
}

function callsForOpportunity(rand: () => number): number {
  let calls = 1; // research
  calls += rand() < P_SCORING_REPROMPT ? 2 : 1; // scoring
  const assets = drawAssetCount(rand);
  for (let i = 0; i < assets; i += 1) {
    calls += rand() < P_FABRICATION_REPROMPT ? 2 : 1;
  }
  return calls;
}

// ============================================================
// Simulation
// ============================================================

async function simulate(items: number, rpm: number, rate429: number, seed = 42) {
  const rand = mulberry32(seed);
  const clock = simClock();
  const stats = createStats();
  const config = { ...resolveThrottleConfig({}, () => undefined), maxRpm: rpm };
  const throttle = createThrottle({
    config,
    clock,
    stats,
    random: rand,
    log: () => undefined, // the tally is what we report, not the chatter
  });

  const perItem: number[] = [];
  let attempts = 0;

  // The pipeline is sequential: one opportunity at a time, and within an
  // opportunity the calls are awaited in order. The simulation mirrors that.
  for (let i = 0; i < items; i += 1) {
    const calls = callsForOpportunity(rand);
    perItem.push(calls);

    for (let c = 0; c < calls; c += 1) {
      await throttle(async () => {
        attempts += 1;
        await clock.sleep(API_LATENCY_MS); // the API's own response time
        if (rand() < rate429) {
          throw new HttpStatusError("Gemini request failed: HTTP 429", 429);
        }
        return "ok";
      }).catch(() => undefined); // exhausted retries degrade, they don't stop the run
    }
  }

  const totalCalls = perItem.reduce((a, b) => a + b, 0);
  const elapsedMs = clock.current();
  return { perItem, totalCalls, attempts, elapsedMs, stats, config };
}

function mins(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function histogram(perItem: number[]): string {
  const counts = new Map<number, number>();
  for (const n of perItem) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([calls, n]) => `${calls} calls ×${n}`)
    .join(", ");
}

async function main(): Promise<void> {
  const items = Number(process.argv[2] ?? 25);
  const rpm = Number(process.argv[3] ?? THROTTLE_DEFAULTS.maxRpm);
  const rate = Number(process.argv[4] ?? 0);

  console.log(
    `\nStage-3 run simulation — ${items} opportunities, no live Gemini call\n` +
      `Per-opportunity calls drawn from the real pattern (research 1 + scoring 1-2 + evidence 1-6)\n` +
      `API latency modelled at ${API_LATENCY_MS}ms/call\n`
  );

  console.log(
    "  RPM  429-rate  opportunities  calls  attempts  429'd  recovered  failed  elapsed"
  );
  console.log("  ───────────────────────────────────────────────────────────────────────────────");

  const scenarios: [number, number][] =
    process.argv.length > 3
      ? [[rpm, rate]]
      : [
          [12, 0], // the shipped default, throttle doing its job
          [12, 0.05], // a residual 5% 429 rate despite pacing
          [15, 0], // at the recorded ceiling, no margin
          [60, 0.6], // no meaningful throttle: the regime that caused the defect
        ];

  let firstRun: Awaited<ReturnType<typeof simulate>> | null = null;

  for (const [r, q] of scenarios) {
    const out = await simulate(items, r, q);
    if (firstRun === null) firstRun = out;
    console.log(
      `  ${String(r).padStart(3)}  ${(q * 100).toFixed(0).padStart(7)}%  ` +
        `${String(items).padStart(13)}  ${String(out.totalCalls).padStart(5)}  ` +
        `${String(out.attempts).padStart(8)}  ${String(out.stats.rateLimited).padStart(5)}  ` +
        `${String(out.stats.succeededAfterRetry).padStart(9)}  ` +
        `${String(out.stats.failedPermanently).padStart(6)}  ${mins(out.elapsedMs).padStart(7)}`
    );
  }

  if (firstRun !== null) {
    console.log(
      `\n  Call spread across ${items} opportunities: ${histogram(firstRun.perItem)}` +
        `\n  Mean ${(firstRun.totalCalls / items).toFixed(1)} calls/opportunity` +
        `\n  Daily budget: 500 RPD ÷ ${(firstRun.totalCalls / items).toFixed(1)} ≈ ` +
        `${Math.floor(500 / (firstRun.totalCalls / items))} opportunities/day ` +
        `(~${(500 / firstRun.totalCalls).toFixed(1)} runs of ${items})\n`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
