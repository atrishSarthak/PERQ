import { describe, expect, it } from "vitest";
import { mapDbCardToScoringCard } from "@/lib/mimir/cardMapper";
import type { Card as DbCard } from "@perq/db";

function makeDbCard(overrides: Partial<DbCard> = {}): DbCard {
  return {
    id: "card-1",
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    tier: "mid",
    joiningFee: "0",
    annualFee: "500",
    feeWaiverCondition: null,
    rewardRates: { dining: 0.05 },
    milestoneBenefits: null,
    welcomeBonus: null,
    loungeAccess: null,
    forexMarkupPct: "3.5",
    redemptionValue: "0.25",
    minIncomeEligibility: "300000",
    coBrandPartner: null,
    status: "active",
    sourceUpdatedAt: new Date(),
    ...overrides,
  } as DbCard;
}

describe("mapDbCardToScoringCard", () => {
  it("converts numeric (string) columns to real numbers", () => {
    const mapped = mapDbCardToScoringCard(makeDbCard({ annualFee: "1250" }));
    expect(mapped.annualFee).toBe(1250);
    expect(typeof mapped.annualFee).toBe("number");
  });

  it("fills in all 8 spend categories even when rewardRates jsonb only has some", () => {
    const mapped = mapDbCardToScoringCard(makeDbCard({ rewardRates: { dining: 0.05 } }));
    expect(mapped.rewardRates.dining).toBe(0.05);
    expect(mapped.rewardRates.travel).toBe(0);
    expect(mapped.rewardRates.utilities).toBe(0);
    expect(Object.keys(mapped.rewardRates)).toHaveLength(8);
  });

  it("defaults milestoneBenefits to an empty array when jsonb is null", () => {
    const mapped = mapDbCardToScoringCard(makeDbCard({ milestoneBenefits: null }));
    expect(mapped.milestoneBenefits).toEqual([]);
  });

  it("passes through milestoneBenefits when present", () => {
    const mapped = mapDbCardToScoringCard(
      makeDbCard({ milestoneBenefits: [{ spendThreshold: 100000, bonusValue: 2000 }] })
    );
    expect(mapped.milestoneBenefits).toEqual([{ spendThreshold: 100000, bonusValue: 2000 }]);
  });

  it("maps minIncomeEligibility null through as null, not 0", () => {
    const mapped = mapDbCardToScoringCard(makeDbCard({ minIncomeEligibility: null }));
    expect(mapped.minIncomeEligibility).toBeNull();
  });

  it("converts a present minIncomeEligibility string to a number", () => {
    const mapped = mapDbCardToScoringCard(makeDbCard({ minIncomeEligibility: "750000" }));
    expect(mapped.minIncomeEligibility).toBe(750000);
  });
});
