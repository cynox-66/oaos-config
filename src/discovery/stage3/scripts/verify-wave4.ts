// verify-wave4.ts
// File: src/discovery/stage3/scripts/verify-wave4.ts
// Purpose: bounded, exhaustively-scoped Step 1 network verification for
//          Wave 4 OSS sources (LFDT, CNCF, ESoC, NLnet, Outreachy, GSoC, GHSL).
//          Each invocation makes exactly one HTTP request (one transient
//          retry max, on timeout/5xx only) and prints status + parsed
//          structure so findings can be reasoned about between invocations.
//
// NOT part of the automated suite: filename doesn't match vitest's default
// test glob (**/*.{test,spec}.*) — same exclusion mechanism as
// stage3/scripts/live-verify.ts. Run manually only:
//
//   npx tsx src/discovery/stage3/scripts/verify-wave4.ts <url> [github|atom|raw]

import "dotenv/config";
import { buildAuthHeader } from "../github-repo";
import { parseAtomFeed } from "../atom-feed";

interface RawResponse {
  status: number;
  body: string;
  attempt: number;
}

async function fetchOnce(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "oaos-wave4-verify", ...headers } });
  return { status: res.status, body: await res.text() };
}

async function fetchWithRetry(url: string, headers?: Record<string, string>): Promise<RawResponse> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const res = await fetchOnce(url, headers);
    if (res.status >= 500 && attempt < 2) continue;
    return { ...res, attempt };
  }
}

function truncate(s: string, lines: number): string {
  return s.split("\n").slice(0, lines).join("\n");
}

interface ContentsEntry {
  name: string;
  path: string;
  type: string;
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const mode = process.argv[3] ?? "raw";
  if (!url) {
    console.error("usage: verify-wave4.ts <url> [github|atom|raw]");
    process.exit(1);
  }

  const headers =
    mode === "github"
      ? { Accept: "application/vnd.github+json", ...(buildAuthHeader(process.env.GITHUB_TOKEN) ?? {}) }
      : undefined;

  const res = await fetchWithRetry(url, headers);
  console.log(`URL: ${url}`);
  console.log(`status: ${res.status} (attempt ${res.attempt})`);

  if (mode === "github" && res.status === 200) {
    const parsed = JSON.parse(res.body) as ContentsEntry[] | ContentsEntry;
    if (Array.isArray(parsed)) {
      console.log(`entries (${parsed.length}):`);
      for (const e of parsed) console.log(`  [${e.type}] ${e.name}  (${e.path})`);
    } else {
      console.log(truncate(JSON.stringify(parsed, null, 2), 40));
    }
  } else if (mode === "atom" && res.status === 200) {
    const { entries, errors } = parseAtomFeed(res.body);
    console.log(`parsed entries: ${entries.length}, parse errors: ${errors.length}`);
    entries.slice(0, 3).forEach((e, i) => console.log(`[${i}] ${JSON.stringify(e).slice(0, 300)}`));
    if (errors.length) console.log(`errors sample: ${JSON.stringify(errors.slice(0, 3))}`);
  } else {
    console.log(truncate(res.body, 25));
  }
}

main();
