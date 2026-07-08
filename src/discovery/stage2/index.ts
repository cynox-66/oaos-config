// index.ts
// File: src/discovery/stage2/index.ts
// Purpose: Public surface of the Stage 2 discovery (email-alert parsing) layer.
//          Consumers use `parseAlertEmail` (detect + parse) or `detectSource`;
//          individual parsers are exported for targeted use/testing.

export type { AlertSource, ParsedListing } from "./types";
export { detectSource, parseAlertEmail } from "./parse";

export { parseAlert as parseLinkedInAlert } from "./parsers/linkedin";
export { parseAlert as parseIndeedAlert } from "./parsers/indeed";
export { parseAlert as parseWellfoundAlert } from "./parsers/wellfound";
export { parseAlert as parseWeWorkRemotelyAlert } from "./parsers/weworkremotely";
export { parseAlert as parseUpworkAlert } from "./parsers/upwork";
export { parseAlert as parseRemoteOkAlert } from "./parsers/remoteok";
