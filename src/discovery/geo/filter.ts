// filter.ts
// File: src/discovery/geo/filter.ts
// Purpose: Partition a run's deduped batch by geo eligibility. Pure. The
//          orchestrator calls this between within-run dedupe and prerank, so
//          ineligible postings never spend prerank slots or Gemini budget.
//
// The partition-sum invariant is enforced IN-MODULE (prerank's
// nothing-dropped-without-a-reason pattern): every input item lands in
// exactly one bucket or the module throws.

import type { RawItem } from "../../engines/normalization/types";
import type { GeoPreference } from "../scope/types";
import { geoOf } from "./map";
import type { GeoSignal } from "./types";

export interface GeoPartition {
  /** status "eligible" — always proceeds. */
  eligible: RawItem[];
  /** status "ineligible" — never proceeds; reported. */
  ineligible: { item: RawItem; signal: GeoSignal }[];
  /**
   * status "unresolved" — proceeds iff `geo.unresolved === "pass"`; always
   * reported either way. The caller applies the policy; this module only
   * classifies, so the counts stay honest in both policies.
   */
  unresolved: { item: RawItem; signal: GeoSignal }[];
  /** status "unknown_source" — ALWAYS proceeds (ruling Q2); reported loudly. */
  unknown: RawItem[];
}

/**
 * Classify every item. `sourceOf` attributes an item to its source-table
 * name (the orchestrator's `owner` map).
 */
export function partitionByGeo(
  items: RawItem[],
  sourceOf: (item: RawItem) => string,
  geo: GeoPreference
): GeoPartition {
  const partition: GeoPartition = { eligible: [], ineligible: [], unresolved: [], unknown: [] };

  for (const item of items) {
    const signal = geoOf(sourceOf(item), item, geo);
    switch (signal.status) {
      case "eligible":
        partition.eligible.push(item);
        break;
      case "ineligible":
        partition.ineligible.push({ item, signal });
        break;
      case "unresolved":
        partition.unresolved.push({ item, signal });
        break;
      case "unknown_source":
        partition.unknown.push(item);
        break;
    }
  }

  const total =
    partition.eligible.length +
    partition.ineligible.length +
    partition.unresolved.length +
    partition.unknown.length;
  if (total !== items.length) {
    throw new Error(
      `partitionByGeo invariant violated: ${items.length} in, ${total} out — an item was dropped without a bucket`
    );
  }
  return partition;
}

/** The items that proceed to prerank under the operator's unresolved policy. */
export function itemsPassingGeo(partition: GeoPartition, geo: GeoPreference): RawItem[] {
  return [
    ...partition.eligible,
    ...(geo.unresolved === "pass" ? partition.unresolved.map((u) => u.item) : []),
    ...partition.unknown,
  ];
}
