import type { NudgePayload } from "./types";

// Gemini rewrites a nudge's wording only (handoff §7.1 step 6). This check
// decides whether its text may be used; if not, the rule's template is sent.

export const NUDGE_COPY_LIMITS = { title: 90, body: 160 } as const;

/** Urgency and pressure words Ember never uses (no dark patterns). */
export const BANNED_NUDGE_WORDS = [
  "urgent", "urgently", "hurry", "immediately", "asap", "act now", "right now", "last chance",
  "don't miss", "do not miss", "final warning", "warning", "alert", "penalty", "deadline", "!",
] as const;

/** Every number written in the text, commas removed: "₹18,240" → 18240, "4.5%" → 4.5. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}

/**
 * Numbers the copy may use: payload values (and digits inside payload strings,
 * such as "14 Nov"), plus constants in the code-written template ("30%").
 */
export function allowedNumbers(payload: NudgePayload, template: { title: string; body: string }): Set<number> {
  const out = new Set<number>();
  for (const v of Object.values(payload)) {
    if (typeof v === "number") {
      out.add(v);
      out.add(Math.round(v));
    } else if (typeof v === "string") numbersIn(v).forEach((n) => out.add(n));
  }
  numbersIn(`${template.title} ${template.body}`).forEach((n) => out.add(n));
  return out;
}

export type CopyCheck = { ok: true } | { ok: false; reason: string };

export function validateNudgeCopy(
  copy: { title: string; body: string },
  payload: NudgePayload,
  template: { title: string; body: string }
): CopyCheck {
  const title = copy.title.trim();
  const body = copy.body.trim();
  if (!title || !body) return { ok: false, reason: "empty" };
  if (title.length > NUDGE_COPY_LIMITS.title) return { ok: false, reason: "title too long" };
  if (body.length > NUDGE_COPY_LIMITS.body) return { ok: false, reason: "body too long" };
  const text = `${title} ${body}`;
  const lower = text.toLowerCase();
  const banned = BANNED_NUDGE_WORDS.find((w) => (w === "!" ? text.includes("!") : new RegExp(`\\b${w.replace(/'/g, "['’]")}\\b`).test(lower)));
  if (banned) return { ok: false, reason: `banned word: ${banned}` };
  // Shorthand like "₹18k" or "1.2 lakh" can't be checked against the payload.
  if (/\d\s*(k|l|lakh|lakhs|lac|cr|crore)\b/i.test(text)) return { ok: false, reason: "abbreviated amount" };
  const allowed = allowedNumbers(payload, template);
  const stray = numbersIn(text).find((n) => !allowed.has(n));
  if (stray !== undefined) return { ok: false, reason: `number not in payload: ${stray}` };
  return { ok: true };
}
