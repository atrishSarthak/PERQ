import type { Card as DbCard } from "@perq/db";
import type { Card, MilestoneBenefit, SpendCategory } from "@perq/scoring-engine";
import { SPEND_CATEGORIES } from "@perq/scoring-engine";

/**
 * Maps packages/db's Drizzle row (jsonb columns typed as unknown, numeric
 * columns returned as strings by the pg driver) into packages/scoring-
 * engine's own domain Card type. This boundary mapping is deliberately in
 * apps/web, not in either package — scoring-engine has zero dependency on
 * packages/db (worktree design note, Engineering Plan §11).
 */
export function mapDbCardToScoringCard(row: DbCard): Card {
  const rawRewardRates = (row.rewardRates ?? {}) as Partial<
    Record<SpendCategory, number>
  >;
  const rewardRates = SPEND_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = rawRewardRates[category] ?? 0;
      return acc;
    },
    {} as Record<SpendCategory, number>
  );

  const milestoneBenefits = Array.isArray(row.milestoneBenefits)
    ? (row.milestoneBenefits as MilestoneBenefit[])
    : [];

  return {
    id: row.id,
    annualFee: Number(row.annualFee),
    rewardRates,
    milestoneBenefits,
    minIncomeEligibility:
      row.minIncomeEligibility === null ? null : Number(row.minIncomeEligibility),
  };
}
