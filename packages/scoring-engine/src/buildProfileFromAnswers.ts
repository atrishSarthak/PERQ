import {
  estimateSpendFromBucket,
  estimateSpendFromFrequency,
} from "./estimateSpendFromBucket";
import type { IncomeBracket, QuizAnswers, SpendCategory, UserProfile } from "./types";

// Assumed average ₹ value per occurrence for frequency-shaped questions.
// First-pass estimates — refined by real card-database/content research
// (Engineering Plan §8), not an engineering concern.
const AVG_VALUE_PER_FLIGHT = 8000;
const AVG_VALUE_PER_HOTEL_STAY = 3000;

function incomeBracketToNumber(bracket: IncomeBracket): number {
  switch (bracket) {
    case "under-3l":
      return 250_000;
    case "3-6l":
      return 450_000;
    case "6-12l":
      return 900_000;
    case "12l+":
      return 1_500_000;
    default: {
      const _exhaustive: never = bracket;
      throw new Error(`Unknown income bracket: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Converts the raw 13-question quiz answers into the normalized UserProfile
 * shape scoreCards consumes. Single source of truth (2B) — called by both
 * the initial quiz-submit path and every profile-edit re-score, so a bucket
 * definition never drifts between the two call sites.
 *
 * Category mapping (first-pass product decision, refined by real card-
 * database research, not a pure engineering call):
 *   - food delivery (Q6) and dining-out (Q9) both roll into 'dining'
 *   - flight frequency (Q3) -> 'travel', hotel frequency (Q4) -> 'hotels'
 *   - recurring bills by card (Q11) contributes a flat estimate to 'utilities'
 *   - gym membership (Q5) does not feed the deterministic score — it's
 *     lifestyle context, not a reward category in the locked cards.rewardRates
 *     shape (PRD §5)
 */
export function buildProfileFromAnswers(answers: QuizAnswers): UserProfile {
  const dining =
    estimateSpendFromBucket(answers.foodDeliverySpend) +
    estimateSpendFromBucket(answers.diningOutSpend);

  const categorySpend: Record<SpendCategory, number> = {
    dining,
    travel: estimateSpendFromFrequency(answers.flightFrequency, AVG_VALUE_PER_FLIGHT),
    hotels: estimateSpendFromFrequency(answers.hotelFrequency, AVG_VALUE_PER_HOTEL_STAY),
    fuel: estimateSpendFromBucket(answers.fuelSpend),
    groceries: estimateSpendFromBucket(answers.grocerySpend),
    ecommerce: estimateSpendFromBucket(answers.ecommerceSpend),
    utilities: answers.recurringBillsByCard ? 1500 : 0,
    general: 0,
  };

  return {
    categorySpend,
    annualIncome: incomeBracketToNumber(answers.annualIncome),
    feeTolerant: answers.feeTolerant,
    priorityCategories: answers.priorityCategories,
  };
}
