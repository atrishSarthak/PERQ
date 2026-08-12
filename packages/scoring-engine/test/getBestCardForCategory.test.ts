import { describe, expect, it } from "vitest";
import { getBestCardForCategory } from "../src/getBestCardForCategory";
import type { Card } from "../src/types";

function makeCard(id: string, rewardRates: Partial<Card["rewardRates"]>): Card {
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
      ...rewardRates,
    },
  };
}

describe("getBestCardForCategory", () => {
  it("returns null for an empty card list", () => {
    expect(getBestCardForCategory([], "dining")).toBeNull();
  });

  it("returns the card with the highest reward rate for the category", () => {
    const low = makeCard("low", { dining: 0.01 });
    const high = makeCard("high", { dining: 0.05 });
    const mid = makeCard("mid", { dining: 0.02 });
    expect(getBestCardForCategory([low, high, mid], "dining")?.id).toBe("high");
  });

  it("ignores reward rates in other categories", () => {
    const strongTravel = makeCard("travel-card", { travel: 0.1, dining: 0.01 });
    const strongDining = makeCard("dining-card", { travel: 0.01, dining: 0.05 });
    expect(getBestCardForCategory([strongTravel, strongDining], "dining")?.id).toBe(
      "dining-card"
    );
  });

  it("returns the first card on a tie (deterministic reduce order)", () => {
    const a = makeCard("a", { fuel: 0.03 });
    const b = makeCard("b", { fuel: 0.03 });
    expect(getBestCardForCategory([a, b], "fuel")?.id).toBe("a");
  });

  it("treats a missing category rate as 0, not undefined-vs-0 crash", () => {
    const card = makeCard("no-groceries", {});
    expect(getBestCardForCategory([card], "groceries")?.id).toBe("no-groceries");
  });
});
