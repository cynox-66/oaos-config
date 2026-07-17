// config.ts
// File: src/engines/application-package/config.ts
// Purpose: Static configuration for the Application Package Engine (Engine 6):
//          the cover-letter word cap, fabrication-check thresholds and keyword
//          lists, and the per-category tone register. All tunables live here.

// ============================================================
// Cover letter
// ============================================================

/** Hard upper bound on cover-letter length (spec: ≤250 words). */
export const MAX_LETTER_WORDS = 250;

/** Number of ranked evidence assets cited as proof points (spec: exactly 2). */
export const PROOF_POINT_COUNT = 2;

// ============================================================
// Fabrication check (GAP B) — Layer 1 hard rules
// ============================================================

/**
 * A sentence flags when more than this many CONTENT tokens are unsupported
 * (tokens not in the allowed corpus and not in CONNECTIVE_STOPWORDS). The
 * stopword filter removes grammar/rhetoric noise, so every counted token is
 * content-bearing — hence a tighter limit than the pre-stopword era's 3.
 */
export const FABRICATION_SUSPICIOUS_LIMIT = 2;

/** Tokens must be longer than this to count (length > 2). */
export const MIN_TOKEN_LENGTH = 2;

/** Years-of-experience claims: flagged unless the phrase appears in the base resume. */
export const YEARS_OF_EXPERIENCE_REGEX = /\b\d+\+?\s*(years?|yrs?)\b/i;

/** Seniority/title keywords; flagged when absent from the base resume's titles. */
export const TITLE_KEYWORDS = [
  "staff",
  "principal",
  "senior",
  "lead",
  "manager",
  "director",
  "head",
  "vp",
  "chief",
];

/**
 * Puffery/over-claim phrases: flagged unless the exact phrase appears in the
 * base resume. Matched case-insensitively with word boundaries; multi-word
 * phrases tolerate whitespace/hyphen variation ("world class" == "world-class").
 * Digit-less experience claims live here because YEARS_OF_EXPERIENCE_REGEX
 * requires a digit.
 */
export const PUFFERY_PATTERNS = [
  "extensive experience",
  "extensive background",
  "extensive expertise",
  "deep expertise",
  "deep experience",
  "vast experience",
  "broad experience",
  "wealth of experience",
  "proven track record",
  "track record",
  "years of experience",
  "many years",
  "several years",
  "large teams",
  "seasoned",
  "veteran",
  "mastery",
  "world-class",
  "industry-leading",
  "battle-tested",
  "award-winning",
  "single-handedly",
  "spearhead",
  "spearheaded",
  "spearheading",
];

/**
 * Connective stopwords: words that cannot by themselves carry a factual claim,
 * excluded from the unsupported-token count (the narrowed Layer-1 token rule).
 *
 * CURATION RULE — a word stays OFF this list (i.e. keeps counting as
 * suspicious) if it could name a technology, scale, achievement, credential,
 * artifact, or quantity. Deliberately excluded, among others: achievement
 * verbs (built, led, architected, designed, shipped, delivered, spearheaded,
 * won, improved, scaled), scale words (large, global, million, enterprise,
 * teams), artifact/credential nouns (platform, product, system, award,
 * patent, championship, production), and the expert/proven/success families.
 * A missing word fails CLOSED: it still counts, so at worst a harmless
 * sentence flags — never the reverse.
 */
export const CONNECTIVE_STOPWORDS = new Set<string>([
  // --- function/grammar words (tokenizer only keeps length > 2) ---
  "about", "above", "across", "after", "again", "all", "almost", "along",
  "already", "also", "although", "always", "and", "another", "any", "anyone",
  "anything", "are", "around", "because", "become", "becomes", "been",
  "before", "being", "below", "between", "beyond", "both", "but", "can",
  "cannot", "could", "did", "does", "doing", "done", "down", "during", "each",
  "either", "else", "ever", "every", "few", "finally", "first", "for", "from",
  "further", "get",
  "gets", "getting", "had", "has", "have", "having", "her", "here", "hers",
  "him", "his", "how", "however", "into", "its", "itself", "just", "less",
  "let", "like", "likely", "made", "make", "makes", "making", "many", "may",
  "might", "mine", "more", "most", "much", "must", "myself", "near", "need",
  "needs", "neither", "never", "nor", "not", "now", "off", "often", "once",
  "one", "only", "onto", "other", "others", "otherwise", "our", "ours", "out",
  "over", "own", "per", "put", "rather", "really", "same", "second", "she", "should",
  "since", "some", "someone", "something", "soon", "still", "such", "sure",
  "take", "takes", "taking", "than", "that", "the", "their", "theirs", "them",
  "themselves", "then", "there", "these", "they", "thing", "things", "third",
  "this",
  "those", "though", "three", "through", "throughout", "thus", "together",
  "too", "toward", "towards", "two", "under", "until", "upon", "use", "used",
  "uses", "using", "very", "was", "way", "ways", "well", "were", "what",
  "when", "where", "whether", "which", "while", "who", "whom", "whose", "why",
  "will", "with", "within", "without", "would", "yet", "you", "your", "yours",
  // --- letter courtesies / application vocabulary ---
  "appreciate", "appreciation", "application", "apply", "applying", "best",
  "connect", "connecting", "consider", "consideration", "considering",
  "conversation", "dear", "discuss", "discussion", "forward", "glad",
  "grateful", "gratitude", "hiring", "hope", "hoping", "interview", "kind",
  "kindly", "letter", "look", "looking", "opportunities", "opportunity",
  "pleased", "position", "reach", "regard", "regards", "resume", "role",
  "sincerely", "team", "thank", "thankful", "thanks", "time", "warm",
  "warmly", "welcome", "wishes",
  // --- generic rhetorical prose (no claim-bearing capacity alone) ---
  "abilities", "ability", "able", "align", "aligned", "aligns", "alignment",
  "approach", "area", "areas", "aspire", "background", "belief", "believe",
  "bring", "bringing", "brings", "capabilities", "capability", "career",
  "challenge", "challenges", "challenging", "clear", "clearly", "combine",
  "combined", "combines", "commitment", "committed", "complex", "complexity",
  "confidence", "confident", "contribute", "contributes", "contributing",
  "contribution", "contributions", "define", "defined", "defines",
  "demonstrate", "demonstrated", "demonstrates", "directly", "draw", "drawn",
  "drive", "driven", "eager", "effective", "effectively", "enable", "enables",
  "enabling", "engage", "engaging", "ensure", "ensures", "ensuring",
  "enthusiasm", "enthusiastic", "environment", "especially", "exactly",
  "example", "excellent", "excited", "excitement", "exciting", "experience",
  "experiences", "explore", "exploring", "fit", "focus", "focused", "focuses",
  "genuine", "genuinely", "goal", "goals", "great", "greatly", "grounded",
  "grow", "growing", "growth", "help", "helping", "helps", "ideal", "ideally",
  "immediately", "important", "importantly", "include", "includes",
  "including", "insight", "insights", "interest", "interested", "interesting",
  "interests", "journey", "keen", "key", "know", "learn",
  "learned", "learning", "love", "meaningful", "mission", "motivated",
  "motivation", "natural", "naturally", "navigate", "navigating", "offer",
  "offers", "particular", "particularly", "passion", "passionate", "path",
  "people", "perfect", "perfectly", "personal", "personally", "perspective",
  "practical", "professional", "professionally", "prove", "proves", "pursue",
  "pursuing", "quality", "ready", "real", "reliable", "reliably", "seek",
  "seeking", "sense", "share", "sharing", "shows", "skill", "skills",
  "solve", "solving", "strength", "strengths", "strong",
  "strongly", "style", "support", "supporting", "supports", "technical",
  "technically", "think", "thinking", "thrive", "today", "understand",
  "understanding", "unique", "uniquely", "valuable", "value", "values",
  "want", "wants", "willing", "work", "working", "works",
]);

// ============================================================
// Tone register by category (spec Decision Rules)
// ============================================================

/** Tone instruction injected into the cover-letter prompt, keyed by category. */
export const TONE_BY_CATEGORY: Record<string, string> = {
  Startup: "Tone: direct and builder-minded — concrete, action-oriented, no corporate fluff.",
};

/** Tone used for every non-startup category (corporate intern / job / etc.). */
export const DEFAULT_TONE =
  "Tone: structured and credentialed — clear, professional, evidence-led.";
