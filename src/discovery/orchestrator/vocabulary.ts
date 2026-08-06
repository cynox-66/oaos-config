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
//   negativeTerms ← DEFAULT_VOCABULARY **unioned with** the confirmed seniority
//                   dimension's persisted terms. Closed by the seniority wave:
//                   the operator can now express an exclusion, and it comes
//                   from the file like every other confirmed scope decision.
//   roleTerms     ← DEFAULT_VOCABULARY. STILL ASYMMETRIC — preferences.json has
//                   no notion of a role term, and adding one was not in the
//                   seniority wave's scope. Recorded here so the remaining gap
//                   stays visible.
//
// Consequence worth knowing: unticking every field in preferences.json does
// NOT disable prerank — roleTerms still score. It narrows domain relevance to
// nothing, which pushes almost everything below the relevance floor.
//
// NOTE ON THE SENIORITY UNION: prerank is not told about seniority. It receives
// a richer `negativeTerms` list through the injected-data seam it has always
// had, and src/discovery/prerank/ is untouched. Read seniority.ts's header for
// why those terms gate more bluntly than they look — they match an item's WHOLE
// text, not its title (docs/known-issues.md #23).

import { DEFAULT_VOCABULARY } from "../prerank/config";
import type { PrerankVocabulary } from "../prerank/types";
import { seniorityNegativeTerms } from "../scope/seniority";
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

  // Built-ins first, then the operator's exclusions. DEFAULT_VOCABULARY's list
  // is empty today; the union is written honestly so it stays correct if that
  // changes, and deduped so an overlap cannot double-count.
  const negativeSeen = new Set<string>();
  const negativeTerms: string[] = [];
  for (const raw of [...DEFAULT_VOCABULARY.negativeTerms, ...seniorityNegativeTerms(preferences.seniority)]) {
    const term = raw.toLowerCase().replace(/\s+/g, " ").trim();
    if (term === "" || negativeSeen.has(term)) continue;
    negativeSeen.add(term);
    negativeTerms.push(term);
  }

  return {
    domainTerms,
    roleTerms: [...DEFAULT_VOCABULARY.roleTerms],
    negativeTerms,
  };
}
