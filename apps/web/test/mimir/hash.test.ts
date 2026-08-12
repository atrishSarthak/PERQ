import { describe, expect, it } from "vitest";
import { computeCardsVersion, computeProfileHash } from "@/lib/mimir/hash";
import type { QuizAnswers } from "@perq/scoring-engine";

const baseAnswers: QuizAnswers = {
  heldCardIds: [],
  annualIncome: "6-12l",
  flightFrequency: "3-5",
  hotelFrequency: "1-2",
  gymMembership: { active: false, monthlyCost: null },
  foodDeliverySpend: "3-6k",
  ecommerceSpend: "1-3k",
  grocerySpend: "1-3k",
  diningOutSpend: "3-6k",
  fuelSpend: "1-3k",
  recurringBillsByCard: true,
  feeTolerant: true,
  priorityCategories: ["dining", "travel"],
};

describe("computeProfileHash (D6)", () => {
  it("produces the same hash for identical answers", () => {
    expect(computeProfileHash(baseAnswers)).toBe(computeProfileHash({ ...baseAnswers }));
  });

  it("produces the same hash regardless of property order", () => {
    const reordered = Object.fromEntries(
      Object.entries(baseAnswers).reverse()
    ) as unknown as QuizAnswers;
    expect(computeProfileHash(baseAnswers)).toBe(computeProfileHash(reordered));
  });

  it("produces a different hash when any answer changes", () => {
    const edited: QuizAnswers = { ...baseAnswers, fuelSpend: "6k+" };
    expect(computeProfileHash(baseAnswers)).not.toBe(computeProfileHash(edited));
  });
});

describe("computeCardsVersion (D10)", () => {
  it("returns '0' for an empty card list", () => {
    expect(computeCardsVersion([])).toBe("0");
  });

  it("returns the max sourceUpdatedAt across cards, not the first or last", () => {
    const older = new Date("2026-01-01");
    const newest = new Date("2026-06-01");
    const middle = new Date("2026-03-01");
    const version = computeCardsVersion([
      { sourceUpdatedAt: older },
      { sourceUpdatedAt: newest },
      { sourceUpdatedAt: middle },
    ]);
    expect(version).toBe(newest.getTime().toString());
  });

  it("changes when any card's source_updated_at changes (cache invalidation trigger)", () => {
    const before = computeCardsVersion([{ sourceUpdatedAt: new Date("2026-01-01") }]);
    const after = computeCardsVersion([{ sourceUpdatedAt: new Date("2026-01-02") }]);
    expect(before).not.toBe(after);
  });
});
