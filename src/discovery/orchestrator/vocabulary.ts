// vocabulary.ts
// File: src/discovery/orchestrator/vocabulary.ts
// Purpose: Map the operator's confirmed discovery scope (preferences.json,
//          Wave 1 / D15) onto the prerank gate's PrerankVocabulary. Pure — the
//          caller loads the Preferences; this module never touches disk.
//
// The mapping is asymmetric because the two schemas are:
//   domainTerms   ← the ENABLED fields of preferences.json. This is the part
//                   D15 makes the operator confirm, so it is the part that
//                   must come from the file.
//   roleTerms     ← DEFAULT_VOCABULARY. preferences.json has no notion of a
//   negativeTerms   role or an exclusion term; extending its schema is a scope-
//                   module change, deliberately not taken in Wave 6.
//
// Consequence worth knowing: unticking every field in preferences.json does
// NOT disable prerank — roleTerms still score. It narrows domain relevance to
// nothing, which pushes almost everything below the relevance floor.

import { DEFAULT_VOCABULARY } from "../prerank/config";
import type { PrerankVocabulary } from "../prerank/types";
import type { Preferences } from "../scope/types";

/**
 * Build a {@link PrerankVocabulary} from a confirmed scope. Field names are
 * lowercased and trimmed (prerank matches on lowercase terms), empties dropped,
 * duplicates collapsed, order preserved.
 */
export function preferencesToVocabulary(preferences: Preferences): PrerankVocabulary {
  const seen = new Set<string>();
  const domainTerms: string[] = [];

  for (const field of preferences.fields) {
    if (!field.enabled) continue;
    const term = field.name.toLowerCase().trim();
    if (term === "" || seen.has(term)) continue;
    seen.add(term);
    domainTerms.push(term);
  }

  return {
    domainTerms,
    roleTerms: [...DEFAULT_VOCABULARY.roleTerms],
    negativeTerms: [...DEFAULT_VOCABULARY.negativeTerms],
  };
}
