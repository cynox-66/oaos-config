// index.ts
// File: src/engines/application-package/index.ts
// Purpose: Public surface of the Application Package Engine (Engine 6).

export { buildApplicationPackage } from "./package";
export { buildResumeVariant } from "./resume";
export { checkFabrication, tokenize, allowedTokens, splitSentences } from "./fabrication";
export {
  checkFabricationLayered,
  buildSemanticFabricationPrompt,
  parseSemanticVerdict,
} from "./semantic";
export type { SemanticClaim } from "./semantic";
export { generateCoverLetter, wordCount, truncateToWords } from "./letter";
export { buildCoverLetterPrompt, buildRegenPrompt, toneFor, parseLetter } from "./prompt";
export { buildCriticPrompt, parseCriticEdits, applyEdits } from "./critic";
export type { CriticEdit } from "./critic";

export type {
  BaseResume,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  OperatorProfile,
  PackageRequest,
  ApplicationPackage,
  FabricationResult,
  PackageOptions,
} from "./types";
