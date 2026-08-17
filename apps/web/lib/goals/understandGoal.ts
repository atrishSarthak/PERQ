import { z } from "zod";
import { extractStructuredJson, type ResponseSchema } from "@perq/ai";
import { SPEND_CATEGORIES, type SpendCategory } from "@perq/scoring-engine";
import { MAX_CLARIFYING_ROUNDS, type ClarificationTurn } from "./clarification";

/**
 * v2 (open-ended web-search redesign): replaces classifyGoal.ts's fixed
 * 3-category classifier. A single structured-output call (extractStructuredJson,
 * same primitive Feature 1's card search already uses for its own non-grounded
 * step) that:
 *   1. Checks the goal is genuinely a "where/how should I buy this" purchase
 *      question — MIMIR's actual scope — declining honestly otherwise.
 *   2. Classifies directly into the existing 8-value SpendCategory taxonomy
 *      (the same one cards.rewardRates already uses everywhere else), not a
 *      bespoke category system.
 *   3. Extracts only genuinely-stated facts (subject, location, variant,
 *      budget) — never invents one that isn't present or clearly implied.
 *   4. Asks at most ONE clarifying question per call when something needed
 *      to search meaningfully is missing, bounded by MAX_CLARIFYING_ROUNDS.
 */

export interface GoalFacts {
  summary: string; // one-line normalized restatement of the goal
  subject: string; // core product/event/service name
  location: string | null;
  variant: string | null; // trim/size/model/date-range/seat-tier/etc.
  budgetHint: string | null;
}

export type UnderstandGoalResult =
  | { ok: true; category: SpendCategory; facts: GoalFacts }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "needs_clarification"; question: string };

const UNDERSTAND_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    legitimate: { type: "boolean" },
    category: { type: "string" },
    summary: { type: "string", nullable: true },
    subject: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    variant: { type: "string", nullable: true },
    budgetHint: { type: "string", nullable: true },
    needsClarification: { type: "boolean" },
    clarifyingQuestion: { type: "string", nullable: true },
  },
  required: ["legitimate", "needsClarification"],
};

const rawUnderstandResultSchema = z.object({
  legitimate: z.boolean(),
  category: z.enum(SPEND_CATEGORIES as [SpendCategory, ...SpendCategory[]]).nullable().optional(),
  summary: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  budgetHint: z.string().nullable().optional(),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().nullable().optional(),
});

function buildPrompt(
  goalText: string,
  clarification: ClarificationTurn[],
  mustProceed: boolean
): string {
  const transcript =
    clarification.length > 0
      ? `\n\nMIMIR already asked follow-up questions and the user answered:\n${clarification
          .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
          .join("\n")}\n\nTreat these as already-known context — do not ask about anything already covered above.`
      : "";

  const proceedInstruction = mustProceed
    ? `\n\nMIMIR has already asked the maximum number of clarifying questions for this goal. You MUST NOT set needsClarification to true again. Either commit to legitimate:true with your best-effort facts (using sensible, clearly-reasonable defaults for anything still missing — note any assumption briefly in "summary"), or decide the goal is unsupported. Never ask another question.`
    : "";

  return `A user of a financial purchase-advisor app named MIMIR stated this purchase goal in plain language: "${goalText}"${transcript}

Determine:
1. "legitimate" — is this genuinely a "where should I buy this, and how should I pay for it" purchase question? MIMIR only helps with real purchase decisions (a product, an event/experience ticket, a booking, a service purchase) — set false for anything else (general chat, advice unrelated to buying something, or something too vague to ever become a concrete purchase search).
2. If legitimate, "category" — classify the purchase into exactly ONE of these 8 spend categories, picking the closest fit: dining (restaurant/food-delivery purchases), travel (flights, attraction/experience tickets, event/concert tickets), hotels (hotel/stay bookings), fuel (fuel/EV charging), groceries (grocery delivery/purchases), ecommerce (physical products — electronics, appliances, general retail), utilities (bill/utility payments), general (anything else, including movie tickets, which don't fit any of the above cleanly). Always pick the single closest category — never leave this unset when legitimate is true.
3. "summary" — a one-line normalized restatement of exactly what they're trying to buy.
4. "subject" — the core product/event/service name.
5. "location" — a city/place if stated or clearly implied, else null.
6. "variant" — any distinguishing detail (storage size, seat tier, date/date-range, model, etc.) if stated, else null.
7. "budgetHint" — a stated budget/price ceiling if mentioned, else null.

Do not guess or invent a subject, location, variant, or budget that isn't actually stated or clearly implied — leave it null rather than fabricating a plausible-sounding value.

8. "needsClarification" — true only if something genuinely important to searching for this purchase is missing (e.g. no location for something location-specific, no clear product identity). If true, set "clarifyingQuestion" to ONE single, natural, specific next question to ask — never a bulk list of everything missing, just the single most important thing. If false, leave "clarifyingQuestion" null.${proceedInstruction}`;
}

/**
 * Returns ok:true only when the goal is a legitimate purchase question with
 * enough resolved facts to search meaningfully. Otherwise returns an honest
 * decline reason — never guesses a missing fact, never invents a category
 * for an illegitimate goal. A malformed/unparseable model response degrades
 * to "unsupported" rather than throwing — a classification hiccup should
 * never crash the whole search.
 */
export async function understandGoal(
  goalText: string,
  clarification: ClarificationTurn[],
  apiKey: string
): Promise<UnderstandGoalResult> {
  const mustProceed = clarification.length >= MAX_CLARIFYING_ROUNDS;

  let raw: unknown;
  try {
    raw = await extractStructuredJson(
      apiKey,
      buildPrompt(goalText, clarification, mustProceed),
      UNDERSTAND_RESPONSE_SCHEMA
    );
  } catch {
    return { ok: false, reason: "unsupported" };
  }

  const parsed = rawUnderstandResultSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unsupported" };
  const data = parsed.data;

  if (!data.legitimate) return { ok: false, reason: "unsupported" };

  // Defense in depth: even if the model ignores the "must not ask again"
  // instruction at the round cap, the orchestrator never surfaces a 4th
  // question — treat this as "proceed with what we have" instead.
  if (data.needsClarification && data.clarifyingQuestion && !mustProceed) {
    return { ok: false, reason: "needs_clarification", question: data.clarifyingQuestion };
  }

  if (!data.category || !data.subject) return { ok: false, reason: "unsupported" };

  return {
    ok: true,
    category: data.category,
    facts: {
      summary: data.summary ?? data.subject,
      subject: data.subject,
      location: data.location ?? null,
      variant: data.variant ?? null,
      budgetHint: data.budgetHint ?? null,
    },
  };
}
