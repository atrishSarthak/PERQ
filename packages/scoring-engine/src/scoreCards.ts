import { SPEND_CATEGORIES } from "./types";
import type {
  Card,
  CategoryScoreBreakdown,
  ScoredCard,
  UserProfile,
} from "./types";

// Priority-category boost (Q13): a modest extra weight on the annual value
// already earned in a category the user explicitly flagged as a top
// priority — a tie-breaker toward stated preference, not a separate scoring
// dimension. Not specified numerically in the PRD; documented here as a
// deliberate, testable constant rather than a magic number buried in the
// formula.
const PRIORITY_BOOST_MULTIPLIER = 0.1;

function computeMilestoneValue(card: Card, totalAnnualSpend: number): number {
  return card.milestoneBenefits
    .filter((m) => totalAnnualSpend >= m.spendThreshold)
    .reduce((sum, m) => sum + m.bonusValue, 0);
}

/**
 * Feature 1's full-profile ranking (D1, D4). Pure and deterministic — Gemini
 * never adjusts this score; it only explains what's already computed here
 * (Engineering Plan D1). Shares the same reward-rate data-access shape as
 * getBestCardForCategory (card.rewardRates[category]), the primitive Feature
 * 2 reuses directly for its narrower "best card for this one category" case.
 *
 * Formula (Handbook §3): sum over categories of
 * (rewardRate × annualCategorySpend) − annualFee + milestoneBonusValue,
 * plus a small priority-category boost (Q13) and an eligibility flag based
 * on income (Q2 vs. the card's minIncomeEligibility) — ineligible cards are
 * still scored and returned (eligible: false) rather than silently dropped,
 * so callers can decide how to surface them.
 */
export function scoreCards(profile: UserProfile, cards: Card[]): ScoredCard[] {
  const totalAnnualSpend =
    Object.values(profile.categorySpend).reduce((sum, v) => sum + v, 0) * 12;

  const scored: ScoredCard[] = cards.map((card) => {
    const breakdown: CategoryScoreBreakdown[] = SPEND_CATEGORIES.map(
      (category) => {
        const monthlySpend = profile.categorySpend[category] ?? 0;
        const rewardRate = card.rewardRates[category] ?? 0;
        return {
          category,
          monthlySpend,
          rewardRate,
          annualValue: rewardRate * monthlySpend * 12,
        };
      }
    );

    const grossRewardValue = breakdown.reduce((sum, b) => sum + b.annualValue, 0);
    const milestoneValue = computeMilestoneValue(card, totalAnnualSpend);

    const priorityBoost = profile.priorityCategories.reduce((sum, category) => {
      const line = breakdown.find((b) => b.category === category);
      return sum + (line ? line.annualValue * PRIORITY_BOOST_MULTIPLIER : 0);
    }, 0);

    const eligible =
      profile.annualIncome === null ||
      card.minIncomeEligibility === null ||
      profile.annualIncome >= card.minIncomeEligibility;

    const score = grossRewardValue - card.annualFee + milestoneValue + priorityBoost;

    return { card, score, breakdown, milestoneValue, priorityBoost, eligible };
  });

  return scored.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.score - a.score;
  });
}
