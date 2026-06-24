// adapters/index.ts
// File: src/engines/contact-ranking/adapters/index.ts
// Purpose: Re-export source adapters. To add a new candidate source, implement
//          SourceAdapter<TRaw> here and wire it into DiscoveryRequest + rank.ts.

export { fromGithubScan, githubScanAdapter } from "./github-scan";
export { fromManual, manualAdapter } from "./manual";
