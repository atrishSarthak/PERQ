import { describe, expect, it } from "vitest";
import type { ScoredCardV2 } from "@perq/shared";
import { activeFilterCount, applyFiltersAndSort, EMPTY_FILTERS } from "../src/features/results/filterSort";

function card(p: Partial<ScoredCardV2> & { cardId: string; rank: number }): ScoredCardV2 {
  return {
    name: p.cardId, issuer: "Bank A", networks: ["Visa"], ongoingValue: 0, year1Value: 0, rewards: 0, milestoneValue: 0,
    welcomeBenefit: 0, breakdown: [], eligibilityReason: "", reason: "", rewardNotes: "", sourceUrl: "", sourceUpdatedAt: "",
    fdMinAmount: null, fee: { joiningFee: 0, annualFee: 0, waiverSpend: null, qualifyingSpend: 0, waived: false, payable: 0 },
    flags: { upi: false, lifetimeFree: false, fdBacked: false, held: false },
    ...p,
  };
}

const cards = [
  card({ cardId: "a", rank: 1, rewards: 9000, fee: { joiningFee: 1179, annualFee: 1179, waiverSpend: 200000, qualifyingSpend: 0, waived: false, payable: 1179 } }),
  card({ cardId: "b", rank: 2, rewards: 3000, networks: ["RuPay"], issuer: "Bank B", flags: { upi: true, lifetimeFree: true, fdBacked: false, held: false } }),
  card({ cardId: "c", rank: 3, rewards: 12000, fee: { joiningFee: 2950, annualFee: 2950, waiverSpend: null, qualifyingSpend: 0, waived: false, payable: 2950 } }),
];

describe("results filters and sort", () => {
  it("sorts by rank, lowest fee and highest rewards", () => {
    expect(applyFiltersAndSort(cards, EMPTY_FILTERS, "best").map((c) => c.cardId)).toEqual(["a", "b", "c"]);
    expect(applyFiltersAndSort(cards, EMPTY_FILTERS, "lowestFee").map((c) => c.cardId)).toEqual(["b", "a", "c"]);
    expect(applyFiltersAndSort(cards, EMPTY_FILTERS, "highestRewards").map((c) => c.cardId)).toEqual(["c", "a", "b"]);
  });

  it("filters by network, UPI, lifetime free, issuer and fee range (GST-inclusive)", () => {
    expect(applyFiltersAndSort(cards, { ...EMPTY_FILTERS, networks: ["RuPay"] }, "best").map((c) => c.cardId)).toEqual(["b"]);
    expect(applyFiltersAndSort(cards, { ...EMPTY_FILTERS, upiOnly: true }, "best").map((c) => c.cardId)).toEqual(["b"]);
    expect(applyFiltersAndSort(cards, { ...EMPTY_FILTERS, issuers: ["Bank A"] }, "best").map((c) => c.cardId)).toEqual(["a", "c"]);
    expect(applyFiltersAndSort(cards, { ...EMPTY_FILTERS, feeRange: "upto_1000" }, "best").map((c) => c.cardId)).toEqual(["a", "b"]);
    expect(activeFilterCount({ ...EMPTY_FILTERS, upiOnly: true, feeRange: "free" })).toBe(2);
  });
});
