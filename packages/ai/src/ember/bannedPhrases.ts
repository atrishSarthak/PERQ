// No dark patterns (handoff §2): Ember never uses urgency, scarcity or
// hype. Matched case-insensitively as whole phrases.
export const BANNED_PHRASES = [
  "limited time",
  "limited period",
  "act now",
  "act fast",
  "hurry",
  "don't miss out",
  "dont miss out",
  "don't miss",
  "spots left",
  "only a few left",
  "expires soon",
  "ending soon",
  "only today",
  "today only",
  "last chance",
  "before it's gone",
  "guaranteed",
  "guarantee",
  "best ever",
  "best card ever",
  "once in a lifetime",
  "no-brainer",
  "must-have",
  "risk-free",
  "free money",
] as const;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATTERNS = BANNED_PHRASES.map(
  (p) => [p, new RegExp(`(^|[^a-z])${escape(p).replace(/'/g, "['’]")}([^a-z]|$)`, "i")] as const
);

/** Banned phrases present in `text` (empty when clean). */
export function findBannedPhrases(text: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([p]) => p);
}
