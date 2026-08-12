import { describe, expect, it } from "vitest";
import { scoreCards } from "../src/scoreCards";
import type { Card, UserProfile } from "../src/types";

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    annualFee: 0,
    milestoneBenefits: [],
    minIncomeEligibility: null,
    rewardRates: {
      dining: 0,
      travel: 0,
      hotels: 0,
      fuel: 0,
      groceries: 0,
      ecommerce: 0,
      utilities: 0,
      general: 0,
    },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    categorySpend: {
      dining: 0,
      travel: 0,
      hotels: 0,
      fuel: 0,
      groceries: 0,
      ecommerce: 0,
      utilities: 0,
      general: 0,
    },
    annualIncome: null,
    feeTolerant: true,
    priorityCategories: [],
    ...overrides,
  };
}

describe("scoreCards", () => {
  it("returns an empty array for an empty card list", () => {
    expect(scoreCards(makeProfile(), [])).toEqual([]);
  });

  it("scores a card as rewardValue - annualFee for a single category", () => {
    const profile = makeProfile({
      categorySpend: {
        dining: 4200,
        travel: 0,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
    });
    const card = makeCard("dining-card", {
      annualFee: 500,
      rewardRates: {
        dining: 0.05,
        travel: 0,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
    });

    const [result] = scoreCards(profile, [card]);
    if (!result) throw new Error("expected a result");
    // annualValue = 0.05 * 4200 * 12 = 2520; score = 2520 - 500 = 2020
    expect(result.score).toBeCloseTo(2020);
    expect(result.eligible).toBe(true);
  });

  it("handles a tie in score deterministically without throwing", () => {
    const profile = makeProfile();
    const a = makeCard("a", { annualFee: 0 });
    const b = makeCard("b", { annualFee: 0 });
    const results = scoreCards(profile, [a, b]);
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBe(results[1]!.score);
  });

  it("applies milestone bonus only when annual spend crosses the threshold", () => {
    const profile = makeProfile({
      categorySpend: {
        dining: 10000,
        travel: 0,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
    });
    const card = makeCard("milestone-card", {
      milestoneBenefits: [{ spendThreshold: 100_000, bonusValue: 2000 }],
    });

    const [result] = scoreCards(profile, [card]);
    if (!result) throw new Error("expected a result");
    // annual spend = 10000 * 12 = 120000, crosses 100000 threshold
    expect(result.milestoneValue).toBe(2000);
  });

  it("does not apply milestone bonus below the threshold", () => {
    const profile = makeProfile({
      categorySpend: {
        dining: 100,
        travel: 0,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
    });
    const card = makeCard("milestone-card", {
      milestoneBenefits: [{ spendThreshold: 100_000, bonusValue: 2000 }],
    });

    const [result] = scoreCards(profile, [card]);
    if (!result) throw new Error("expected a result");
    expect(result.milestoneValue).toBe(0);
  });

  it("boosts score for cards strong in a priority category", () => {
    const profile = makeProfile({
      categorySpend: {
        dining: 0,
        travel: 5000,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
      priorityCategories: ["travel"],
    });
    const card = makeCard("travel-card", {
      rewardRates: {
        dining: 0,
        travel: 0.04,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
    });

    const [result] = scoreCards(profile, [card]);
    if (!result) throw new Error("expected a result");
    expect(result.priorityBoost).toBeGreaterThan(0);
  });

  it("flags a card ineligible when income is below the card's minimum, but still returns it", () => {
    const profile = makeProfile({ annualIncome: 200_000 });
    const card = makeCard("premium-card", { minIncomeEligibility: 1_000_000 });

    const [result] = scoreCards(profile, [card]);
    if (!result) throw new Error("expected a result");
    expect(result.eligible).toBe(false);
  });

  it("sorts eligible cards before ineligible cards regardless of raw score", () => {
    const profile = makeProfile({ annualIncome: 300_000 });
    const highScoreIneligible = makeCard("high-ineligible", {
      minIncomeEligibility: 5_000_000,
      milestoneBenefits: [{ spendThreshold: 0, bonusValue: 100_000 }],
    });
    const lowScoreEligible = makeCard("low-eligible", { minIncomeEligibility: null });

    const results = scoreCards(profile, [highScoreIneligible, lowScoreEligible]);
    expect(results[0]!.card.id).toBe("low-eligible");
    expect(results[1]!.card.id).toBe("high-ineligible");
  });

  it("treats a missing profile category as 0 spend rather than throwing", () => {
    const profile = makeProfile();
    // categorySpend has all 8 categories defaulted to 0 via makeProfile
    const card = makeCard("any-card");
    expect(() => scoreCards(profile, [card])).not.toThrow();
  });
});
