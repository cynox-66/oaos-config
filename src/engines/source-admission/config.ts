// config.ts
// File: src/engines/source-admission/config.ts
// Purpose: Static configuration for the Discovery Source Admission Engine
//          (Engine 11).

/** Global cap on total maintenance across all admitted automated sources. */
export const GLOBAL_MAINT_BUDGET_MIN_PER_WEEK = 50;

/** Per-source maintenance ceiling. */
export const MAX_MAINT_MIN_PER_WEEK = 10;
