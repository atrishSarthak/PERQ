import { z } from "zod";
import { extractStructuredJson, type ResponseSchema } from "@perq/ai";
import type { GoalCategory } from "@perq/scoring-engine";
import type { GoalEntities } from "./channels";

/**
 * Engineering Plan D6: classification AND entity extraction in one single-
 * turn, no-tools structured-output call — "I want to book a movie ticket"
 * classifies as `movie` but has no movie name or city to search
 * BookMyShow/District with, so classification alone isn't enough; this
 * call resolves both at once. Uses extractStructuredJson (packages/ai),
 * the same single-turn structured-output primitive Feature 1's D15 already
 * uses for card extraction — no new generic call shape invented.
 *
 * Interpretive note (D6, PRD §8): a single structured-output call is
 * genuine model semantic reasoning, not "hardcoded keyword matching" — see
 * the Engineering Plan's D6 section for the full reasoning on why this
 * satisfies §8 without needing to be a multi-turn tool-calling loop.
 */
const CLASSIFY_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    category: { type: "string" },
    movieName: { type: "string", nullable: true },
    city: { type: "string", nullable: true },
    attractionName: { type: "string", nullable: true },
    productName: { type: "string", nullable: true },
  },
  required: ["category"],
};

const rawClassifyResultSchema = z.object({
  category: z.enum(["movie", "attraction", "electronics", "unsupported"]),
  movieName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  attractionName: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
});

export type ClassifyGoalResult =
  | { ok: true; category: GoalCategory; entities: GoalEntities }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "missing_info"; missingField: string };

function buildPrompt(goalText: string): string {
  return `A user of a financial advisor app named MIMIR stated this purchase goal in plain language: "${goalText}"

Classify it into exactly one of these three categories, based on what they're trying to buy:
- "movie": a movie ticket
- "attraction": a travel or tourist-attraction ticket (museum, theme park, tour, etc.)
- "electronics": an electronics product purchase
- "unsupported": anything that doesn't clearly fit one of the above (e.g. groceries, clothing, a service, an ambiguous or unclear goal)

If the category is "movie", also extract the specific movie name and the city they mentioned (or clearly implied), if present — null if not stated.
If the category is "attraction", also extract the specific attraction/venue name and city, if present — null if not stated.
If the category is "electronics", also extract the specific product name (e.g. "iPhone 15", "Sony WH-1000XM5 headphones"), if present — null if not stated.

Do not guess or invent a movie name, city, attraction name, or product name that isn't actually stated or clearly implied in the goal text — leave it null rather than fabricating a plausible-sounding value.`;
}

/**
 * Returns ok:true only when the goal maps to a real category AND every
 * entity that category's channel search needs is present. Otherwise
 * returns an honest decline reason (D6: "say so plainly rather than
 * guessing or hallucinating a channel," PRD §8) — never guesses a missing
 * city or movie name. A malformed/unparseable model response is treated
 * the same as "unsupported" rather than thrown — a classification hiccup
 * should degrade to an honest decline, not crash the whole search.
 */
export async function classifyGoal(
  goalText: string,
  apiKey: string
): Promise<ClassifyGoalResult> {
  let raw: unknown;
  try {
    raw = await extractStructuredJson(apiKey, buildPrompt(goalText), CLASSIFY_RESPONSE_SCHEMA);
  } catch {
    return { ok: false, reason: "unsupported" };
  }

  const parsed = rawClassifyResultSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unsupported" };
  const data = parsed.data;

  switch (data.category) {
    case "unsupported":
      return { ok: false, reason: "unsupported" };
    case "movie": {
      if (!data.movieName) return { ok: false, reason: "missing_info", missingField: "movie name" };
      if (!data.city) return { ok: false, reason: "missing_info", missingField: "city" };
      return {
        ok: true,
        category: "movie",
        entities: { category: "movie", movieName: data.movieName, city: data.city },
      };
    }
    case "attraction": {
      if (!data.attractionName) {
        return { ok: false, reason: "missing_info", missingField: "attraction name" };
      }
      if (!data.city) return { ok: false, reason: "missing_info", missingField: "city" };
      return {
        ok: true,
        category: "attraction",
        entities: {
          category: "attraction",
          attractionName: data.attractionName,
          city: data.city,
        },
      };
    }
    case "electronics": {
      if (!data.productName) {
        return { ok: false, reason: "missing_info", missingField: "product name" };
      }
      return {
        ok: true,
        category: "electronics",
        entities: { category: "electronics", productName: data.productName },
      };
    }
    default: {
      const _exhaustive: never = data.category;
      throw new Error(`Unknown category: ${String(_exhaustive)}`);
    }
  }
}
