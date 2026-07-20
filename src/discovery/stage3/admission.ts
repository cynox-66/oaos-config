// admission.ts
// File: src/discovery/stage3/admission.ts
// Purpose: Convention, not new admission logic — builds Engine 11's existing
//          SourceProposal from a source module's declared metadata, so every
//          Wave 3-5 source ships an admission record produced the same way.
//          Calls nothing that writes anywhere.

import type { SourceProposal } from "../../engines/source-admission/types";
import type { SourceMeta } from "./types";

export function buildSourceProposal(meta: SourceMeta): SourceProposal {
  return {
    name: meta.name,
    type: meta.ingestion_method,
    auth_required: meta.auth_required,
    est_volume_per_week: meta.est_volume_per_week,
    est_maint_min_per_week: meta.est_maint_min_per_week,
    cost_per_month_inr: meta.cost_per_month_inr ?? 0,
    has_health_check: true,
    dedupe_compatible: true,
    survives_format_change: true,
    justification: meta.justification,
  };
}
