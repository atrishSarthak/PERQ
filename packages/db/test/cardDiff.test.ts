import { describe, expect, it } from "vitest";
import { fieldsEqual } from "../scripts/cardDiff";
import type { Card as DbCard } from "../src/types";
import type { CardSource } from "../scripts/cardSourceSchema";

function makeDbCard(overrides: Partial<DbCard> = {}): DbCard {
  return {
    id: "card-1",
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    tier: null,
    joiningFee: "0",
    annualFee: "500",
    feeWaiverCondition: null,
    rewardRates: { dining: 0.05 },
    milestoneBenefits: [],
    welcomeBonus: null,
    loungeAccess: null,
    forexMarkupPct: null,
    redemptionValue: null,
    minIncomeEligibility: null,
    coBrandPartner: null,
    status: "active",
    sourceUpdatedAt: new Date(),
    ...overrides,
  } as DbCard;
}

function makeSourceCard(overrides: Partial<CardSource> = {}): CardSource {
  return {
    id: "card-1",
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    joiningFee: 0,
    annualFee: 500,
    rewardRates: { dining: 0.05 },
    milestoneBenefits: [],
    ...overrides,
  };
}

describe("fieldsEqual (D10 — drives whether source_updated_at bumps)", () => {
  it("returns true when the source card matches the stored row exactly (re-running unchanged data)", () => {
    expect(fieldsEqual(makeDbCard(), makeSourceCard())).toBe(true);
  });

  it("returns false when annualFee changed", () => {
    expect(fieldsEqual(makeDbCard({ annualFee: "500" }), makeSourceCard({ annualFee: 750 }))).toBe(
      false
    );
  });

  it("returns false when rewardRates changed", () => {
    expect(
      fieldsEqual(
        makeDbCard({ rewardRates: { dining: 0.05 } }),
        makeSourceCard({ rewardRates: { dining: 0.06 } })
      )
    ).toBe(false);
  });

  it("returns false when the existing row is currently discontinued, even if fields match (a reappearing card must be reactivated + version-bumped)", () => {
    expect(fieldsEqual(makeDbCard({ status: "discontinued" }), makeSourceCard())).toBe(false);
  });

  it("treats numeric-string DB fields and numeric source fields as equal when the values match", () => {
    expect(
      fieldsEqual(
        makeDbCard({ minIncomeEligibility: "600000" }),
        makeSourceCard({ minIncomeEligibility: 600000 })
      )
    ).toBe(true);
  });

  it("returns false when milestoneBenefits differ", () => {
    expect(
      fieldsEqual(
        makeDbCard({ milestoneBenefits: [] }),
        makeSourceCard({ milestoneBenefits: [{ spendThreshold: 100000, bonusValue: 2000 }] })
      )
    ).toBe(false);
  });

  it("treats jsonb objects with reordered keys as equal (Postgres does not preserve key insertion order — regression for a real bug caught in E2E verification)", () => {
    const dbCard = makeDbCard({
      rewardRates: { fuel: 0, dining: 0.05, hotels: 0, travel: 0, general: 0.01, ecommerce: 0.01, groceries: 0.01, utilities: 0 },
    });
    const sourceCard = makeSourceCard({
      rewardRates: { dining: 0.05, travel: 0, hotels: 0, fuel: 0, groceries: 0.01, ecommerce: 0.01, utilities: 0, general: 0.01 },
    });
    expect(fieldsEqual(dbCard, sourceCard)).toBe(true);
  });

  it("still detects a real value change even with reordered keys around it", () => {
    const dbCard = makeDbCard({ rewardRates: { fuel: 0, dining: 0.05 } });
    const sourceCard = makeSourceCard({ rewardRates: { dining: 0.08, fuel: 0 } });
    expect(fieldsEqual(dbCard, sourceCard)).toBe(false);
  });
});
