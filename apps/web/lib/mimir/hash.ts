import { createHash } from "node:crypto";
import type { FrequencyBucket, QuizAnswers, SpendBucket } from "@perq/scoring-engine";
import type { Card } from "@perq/db";

/**
 * D6: sha256 of the normalized answers jsonb. Deterministic key sorting so
 * the same answers always hash identically regardless of property order.
 */
export function computeProfileHash(answers: QuizAnswers): string {
  const normalized = JSON.stringify(answers, Object.keys(answers).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * D10: max(source_updated_at) across active cards. A card-database refresh
 * that changes any card's terms bumps this, invalidating every cached
 * explanation at once — coarse-grained by design (seed runs are infrequent,
 * not per-request).
 */
export function computeCardsVersion(cards: Pick<Card, "sourceUpdatedAt">[]): string {
  if (cards.length === 0) return "0";
  const latest = cards.reduce(
    (max, c) => (c.sourceUpdatedAt > max ? c.sourceUpdatedAt : max),
    cards[0]!.sourceUpdatedAt
  );
  return latest.getTime().toString();
}

// A 2-tier read on a spend bucket / frequency answer — coarse enough that
// many exact answers still collapse into the same tier (keeping the bucket
// space small and cache-friendly), but fine enough to separate a
// fuel-heavy profile from a dining-heavy one, which the previous 3-field
// key (income/fee/priority only) couldn't do at all.
function spendTier(bucket: SpendBucket): "low" | "high" {
  return bucket === "<1k" || bucket === "1-3k" ? "low" : "high";
}
function frequencyTier(freq: FrequencyBucket): "low" | "high" {
  return freq === "never" || freq === "1-2" ? "low" : "high";
}

/**
 * D15: the search-cache partition key — deliberately coarser than
 * computeProfileHash, but wide enough to actually separate distinct spend
 * shapes. Built from income bracket, fee tolerance, the user's explicit
 * top-2 priority categories, AND a coarse (low/high) tier per spend
 * category/frequency — not the exact bucket values. This still lets many
 * users with a genuinely similar profile shape share one cached web search
 * (keeping Gemini calls bounded against the free-tier quota), but a user
 * whose spend pattern actually differs (e.g. fuel-heavy vs. dining-heavy)
 * now gets a different bucket instead of being silently lumped in with
 * everyone at the same income/fee/priority combination.
 */
export function computeSearchBucketKey(answers: QuizAnswers): string {
  const shape = {
    annualIncome: answers.annualIncome,
    feeTolerant: answers.feeTolerant,
    priorityCategories: [...answers.priorityCategories].sort(),
    travelTier: frequencyTier(answers.flightFrequency),
    hotelsTier: frequencyTier(answers.hotelFrequency),
    diningTier:
      spendTier(answers.foodDeliverySpend) === "high" || spendTier(answers.diningOutSpend) === "high"
        ? "high"
        : "low",
    fuelTier: spendTier(answers.fuelSpend),
    groceriesTier: spendTier(answers.grocerySpend),
    ecommerceTier: spendTier(answers.ecommerceSpend),
  };
  const normalized = JSON.stringify(shape, Object.keys(shape).sort());
  return createHash("sha256").update(normalized).digest("hex");
}
