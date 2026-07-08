#!/usr/bin/env tsx
// index.ts
// File: cli/index.ts
// Purpose: `oaos` CLI entry point. Loads .env, dispatches to a subcommand, and
//          turns any thrown error into a clean non-zero exit. Run via:
//            npx tsx cli/index.ts <command> [flags]
//            npm run oaos -- <command> [flags]

import * as dotenv from "dotenv";
dotenv.config({ quiet: true });

import { runIntake } from "./commands/intake";
import { runScore } from "./commands/score";
import { runContacts } from "./commands/contacts";
import { runReport } from "./commands/report";
import { runDiscoverCommand } from "./commands/discover";

const HELP = `oaos — OAOS command line

Usage:
  oaos intake                                  Interactively add + score an opportunity
  oaos score --company "Name"                  Re-score an existing opportunity
  oaos contacts --repo owner/repo [--min-contributions N]
                                               Scan a repo and import contributors
  oaos discover [--dir <path>] [--dry-run]     Parse alert emails in discovery-inbox/ → pipeline
  oaos report                                  Weekly snapshot from the live base

Run via: npx tsx cli/index.ts <command>  (or  npm run oaos -- <command>)
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "intake":
      await runIntake();
      break;
    case "score":
      await runScore(rest);
      break;
    case "contacts":
      await runContacts(rest);
      break;
    case "discover":
      await runDiscoverCommand(rest);
      break;
    case "report":
      await runReport();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(HELP);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
