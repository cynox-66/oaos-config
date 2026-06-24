// adapters/index.ts
// File: src/engines/normalization/adapters/index.ts
// Purpose: Adapter registry + selection. To add a new source adapter, implement
//          the SourceAdapter interface and insert it before the job_board
//          fallback (which matches everything). First match wins.

import type { RawItem, SourceAdapter } from "../types";
import { manualAdapter } from "./manual";
import { jobBoardAdapter } from "./job_board";

/**
 * Ordered adapter registry. More specific adapters come first; the generic
 * job_board adapter is the catch-all and must stay last.
 */
export const ADAPTERS: readonly SourceAdapter[] = [manualAdapter, jobBoardAdapter];

/** Select the first adapter whose `matches` returns true. */
export function selectAdapter(raw: RawItem): SourceAdapter {
  const adapter = ADAPTERS.find((a) => a.matches(raw));
  // jobBoardAdapter always matches, so this is never undefined; assert for TS.
  return adapter ?? jobBoardAdapter;
}

export { manualAdapter, jobBoardAdapter };
