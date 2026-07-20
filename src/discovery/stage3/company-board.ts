// company-board.ts
// File: src/discovery/stage3/company-board.ts
// Purpose: The company_board family — a registry-driven Stage3Source built
//          from a platform adapter (Greenhouse, Lever, Workday, Ashby, ...;
//          Wave 3) and a list of company registry entries. One company
//          failing never stops the others: per-entry errors are collected,
//          never thrown out of fetch().

import type { RawItem } from "../../engines/normalization/types";
import type {
  CompanyBoardAdapter,
  CompanyRegistryEntry,
  FetchResult,
  HealthCheckResult,
  SourceDeps,
  SourceError,
  SourceErrorKind,
  Stage3Source,
} from "./types";

export class SourceFetchError extends Error {
  kind: SourceErrorKind;
  constructor(kind: SourceErrorKind, detail: string) {
    super(detail);
    this.kind = kind;
  }
}

async function fetchRegistry(
  adapter: CompanyBoardAdapter,
  registry: CompanyRegistryEntry[],
  deps: SourceDeps
): Promise<FetchResult> {
  const items: RawItem[] = [];
  const errors: SourceError[] = [];

  for (const entry of registry) {
    if (!entry.enabled) continue;
    const scope = `${adapter.platform}:${entry.token}`;
    try {
      const result = await adapter.fetchOne(entry, deps);
      if (!Array.isArray(result)) {
        errors.push({ scope, kind: "shape", detail: "adapter.fetchOne did not return an array" });
        continue;
      }
      items.push(...result);
    } catch (err) {
      if (err instanceof SourceFetchError) {
        errors.push({ scope, kind: err.kind, detail: err.message });
      } else {
        errors.push({ scope, kind: "http", detail: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { items, errors };
}

/**
 * healthCheck is family-level, not per-entry: partial failure (some
 * companies fetch fine, others error) reports ok:true with the degraded
 * entries named in detail, because per-entry isolation in fetch() would
 * otherwise be defeated by the health machine auto-disabling the whole
 * family over one rotted token. ok:false only when every enabled entry
 * failed.
 */
export function createCompanyBoardSource(
  adapter: CompanyBoardAdapter,
  registry: CompanyRegistryEntry[],
  enabled = true
): Stage3Source {
  return {
    name: adapter.platform,
    family: "company_board",
    enabled,
    fetch: (deps) => fetchRegistry(adapter, registry, deps),
    healthCheck: async (deps): Promise<HealthCheckResult> => {
      const enabledEntries = registry.filter((e) => e.enabled);
      if (enabledEntries.length === 0) {
        return { ok: true, checkedAt: deps.now(), detail: "no enabled registry entries" };
      }

      const { items, errors } = await fetchRegistry(adapter, registry, deps);
      const totalFailure = errors.length === enabledEntries.length;

      if (totalFailure) {
        return {
          ok: false,
          checkedAt: deps.now(),
          detail: `all ${enabledEntries.length} entries failed: ${errors.map((e) => e.scope).join(", ")}`,
        };
      }

      if (errors.length > 0) {
        return {
          ok: true,
          checkedAt: deps.now(),
          detail: `degraded: ${errors.length}/${enabledEntries.length} entries failed (${errors
            .map((e) => e.scope)
            .join(", ")}); ${items.length} items from the rest`,
        };
      }

      return {
        ok: true,
        checkedAt: deps.now(),
        detail: `all ${enabledEntries.length} entries healthy, ${items.length} items`,
      };
    },
  };
}
