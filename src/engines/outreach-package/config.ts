// config.ts
// File: src/engines/outreach-package/config.ts
// Purpose: Static configuration for the Outreach Package Engine (Engine 7):
//          per-channel length limits, the banned-phrase list, greeting openers,
//          ask-type intents, and the Gemini call cap. All tunables live here.

import type { AskType, Channel } from "./types";

// ============================================================
// Per-channel constraints (spec Logic step 2 + STEP 2)
// ============================================================

export interface ChannelLimit {
  /** Whether this channel carries a subject line. */
  hasSubject: boolean;
  /** Max body words (channels measured in words). */
  bodyMaxWords?: number;
  /** Max body chars (linkedin_connect is measured in chars). */
  bodyMaxChars?: number;
  /** Max subject words (email only). */
  subjectMaxWords?: number;
}

export const CHANNEL_LIMITS: Record<Channel, ChannelLimit> = {
  email: { hasSubject: true, bodyMaxWords: 110, subjectMaxWords: 10 },
  linkedin_connect: { hasSubject: false, bodyMaxChars: 300 },
  linkedin_dm: { hasSubject: false, bodyMaxWords: 80 },
  github: { hasSubject: false, bodyMaxWords: 150 },
  slack: { hasSubject: false, bodyMaxWords: 80 },
};

// ============================================================
// Banned phrases (hard regex/substring gate — never LLM-judged)
// ============================================================

/** Lowercased, straight-apostrophe banned phrases (substring match). */
export const BANNED_PHRASES: string[] = [
  "pick your brain",
  "passionate about",
  "just following up",
  "hope this finds you well",
  "huge fan",
  "love your work",
  "i'd love to",
  "circle back",
  "touch base",
  "reaching out because",
  "i came across your profile",
];

// ============================================================
// Opener check (first word of body must not be a greeting)
// ============================================================

export const GREETING_OPENERS: string[] = ["hi", "hello", "hey", "dear", "greetings"];

// ============================================================
// Ask-type intents (injected into the prompt)
// ============================================================

export const ASK_TYPE_INTENT: Record<AskType, string> = {
  internship_inquiry: "ask about an internship opportunity",
  oss_contribution: "offer to contribute to their open-source project",
  advice: "ask for brief, specific technical advice",
  collaboration: "propose a concrete technical collaboration",
  freelance_pitch: "pitch freelance/contract help",
  referral_request: "ask for a referral",
};

// ============================================================
// Generation
// ============================================================

/** Max Gemini calls per draft: one generation + at most one regeneration. */
export const MAX_GEMINI_CALLS = 2;
