import { describe, expect, it } from "vitest";
import {
  annualFeeAfterWaiver,
  annualRewards,
  annualSpend,
  CATEGORIES,
  formatInr,
  leakage,
  monthlyRewardsByCategory,
  netAnnualValue,
  type Category,
  type FinanceCard,
  type MonthlySpend,
} from "../src";

const zeroSpend = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as MonthlySpend;
const zeroRates = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

function spend(partial: Partial<MonthlySpend>): MonthlySpend {
  return { ...zeroSpend, ...partial };
}

function card(partial: Partial<FinanceCard> & { id: string }): FinanceCard {
  return {
    joiningFee: 0,
    annualFee: 0,
    rewardRates: { ...zeroRates },
    rewardCaps: {},
    feeWaiverSpend: null,
    welcomeBenefitValue: 0,
    ...partial,
  };
}

describe("monthlyRewardsByCategory", () => {
  it("applies the rate per category", () => {
    const c = card({ id: "a", rewardRates: { ...zeroRates, food_delivery: 5, other: 1 } });
    const lines = monthlyRewardsByCategory(spend({ food_delivery: 4000, other: 2000 }), c);
    const food = lines.find((l) => l.category === "food_delivery")!;
    expect(food.monthlyReward).toBe(200);
    expect(food.annualReward).toBe(2400);
    expect(food.capApplied).toBe(false);
    expect(lines.find((l) => l.category === "other")!.monthlyReward).toBe(20);
  });

  it("applies a per-category monthly cap on the reward", () => {
    const c = card({
      id: "a",
      rewardRates: { ...zeroRates, online_shopping: 5 },
      rewardCaps: { online_shopping: 100 },
    });
    const line = monthlyRewardsByCategory(spend({ online_shopping: 8000 }), c).find(
      (l) => l.category === "online_shopping"
    )!;
    expect(line.uncappedMonthly).toBe(400);
    expect(line.monthlyReward).toBe(100);
    expect(line.capApplied).toBe(true);
    expect(line.monthlyCap).toBe(100);
  });

  it("scales all categories down proportionally under a total cap", () => {
    const c = card({
      id: "a",
      rewardRates: { ...zeroRates, dining: 10, groceries: 10 },
      rewardCaps: { total: 300 },
    });
    const lines = monthlyRewardsByCategory(spend({ dining: 3000, groceries: 1000 }), c);
    const dining = lines.find((l) => l.category === "dining")!;
    const groceries = lines.find((l) => l.category === "groceries")!;
    expect(dining.monthlyReward + groceries.monthlyReward).toBeCloseTo(300);
    expect(dining.monthlyReward).toBeCloseTo(225);
    expect(dining.capApplied && groceries.capApplied).toBe(true);
  });

  it("applies a cap shared by a group of categories, leaving others alone", () => {
    const c = card({
      id: "a",
      rewardRates: { ...zeroRates, online_shopping: 5, food_delivery: 5, dining: 1 },
      capGroups: [{ categories: ["online_shopping", "food_delivery"], monthlyCap: 100 }],
    });
    const lines = monthlyRewardsByCategory(spend({ online_shopping: 3000, food_delivery: 1000, dining: 5000 }), c);
    const by = (c: Category) => lines.find((l) => l.category === c)!;
    expect(by("online_shopping").monthlyReward + by("food_delivery").monthlyReward).toBeCloseTo(100);
    expect(by("online_shopping").monthlyReward).toBeCloseTo(75);
    expect(by("dining").monthlyReward).toBe(50);
    expect(by("dining").capApplied).toBe(false);
  });

  it("returns zero everywhere for zero spend", () => {
    const c = card({ id: "a", rewardRates: { ...zeroRates, other: 2 } });
    expect(monthlyRewardsByCategory(zeroSpend, c).every((l) => l.monthlyReward === 0)).toBe(true);
  });

  it("treats negative spend as zero", () => {
    const c = card({ id: "a", rewardRates: { ...zeroRates, other: 2 } });
    expect(annualRewards(spend({ other: -5000 }), c).total).toBe(0);
  });
});

describe("annualRewards", () => {
  it("multiplies by 12 and adds milestones reached", () => {
    const c = card({
      id: "a",
      rewardRates: { ...zeroRates, other: 1 },
      milestones: [
        { annualSpend: 100_000, value: 500 },
        { annualSpend: 500_000, value: 5000 },
      ],
    });
    // ₹10,000/month = ₹1,20,000/yr: first milestone only.
    expect(annualRewards(spend({ other: 10_000 }), c)).toEqual({
      fromCategories: 1200,
      milestones: 500,
      total: 1700,
    });
  });
});

describe("annualFeeAfterWaiver", () => {
  const feeCard = card({ id: "f", annualFee: 500, feeWaiverSpend: 200_000, waiverExcludes: ["fuel"] });

  it("charges the renewal fee plus 18% GST below the waiver threshold", () => {
    const fee = annualFeeAfterWaiver(spend({ other: 10_000 }), feeCard);
    expect(fee).toMatchObject({ annualFee: 590, waived: false, payable: 590, qualifyingSpend: 120_000 });
  });

  it("waives the fee when projected annual spend reaches the threshold", () => {
    const fee = annualFeeAfterWaiver(spend({ other: 17_000 }), feeCard); // ₹2,04,000/yr
    expect(fee.waived).toBe(true);
    expect(fee.payable).toBe(0);
  });

  it("ignores excluded categories when judging the waiver", () => {
    const fee = annualFeeAfterWaiver(spend({ other: 10_000, fuel: 10_000 }), feeCard);
    expect(fee.qualifyingSpend).toBe(120_000);
    expect(fee.waived).toBe(false);
  });

  it("is zero for a lifetime-free card", () => {
    expect(annualFeeAfterWaiver(spend({ other: 1000 }), card({ id: "free" })).payable).toBe(0);
  });
});

describe("netAnnualValue", () => {
  const c = card({
    id: "a",
    joiningFee: 500,
    annualFee: 500,
    feeWaiverSpend: 200_000,
    welcomeBenefitValue: 500,
    rewardRates: { ...zeroRates, other: 2 },
  });

  it("year 1 = rewards − joining fee (incl. GST) + welcome benefit", () => {
    const v = netAnnualValue(spend({ other: 5000 }), c, { year: 1 });
    // rewards 1200, joining 590, welcome 500
    expect(v).toEqual({ year: 1, rewards: 1200, fee: 590, welcomeBenefit: 500, net: 1110 });
  });

  it("ongoing excludes the joining fee and welcome benefit, applies the renewal waiver", () => {
    expect(netAnnualValue(spend({ other: 5000 }), c, { year: "ongoing" })).toEqual({
      year: "ongoing",
      rewards: 1200,
      fee: 590,
      welcomeBenefit: 0,
      net: 610,
    });
    expect(netAnnualValue(spend({ other: 20_000 }), c, { year: "ongoing" }).fee).toBe(0);
  });

  it("only gives the welcome benefit in year 1", () => {
    expect(netAnnualValue(zeroSpend, c, { year: 1 }).welcomeBenefit).toBe(500);
    expect(netAnnualValue(zeroSpend, c, { year: "ongoing" }).welcomeBenefit).toBe(0);
  });

  it("goes negative when the fee beats the rewards, at zero spend", () => {
    expect(netAnnualValue(zeroSpend, c, { year: "ongoing" }).net).toBe(-590);
  });

  it("rounds once at the end, not per line", () => {
    // Three categories each earning ₹0.5/yr: rounding per line would give
    // ₹3 (or ₹0); the true ₹1.5 total rounds once to ₹2.
    const tiny = card({ id: "t", rewardRates: { ...zeroRates, dining: 0.5, groceries: 0.5, fuel: 0.5 } });
    const s = spend({ dining: 100 / 12, groceries: 100 / 12, fuel: 100 / 12 });
    expect(netAnnualValue(s, tiny, { year: "ongoing" }).net).toBe(2);
    expect(Number.isInteger(netAnnualValue(s, tiny, { year: 1 }).net)).toBe(true);
  });
});

describe("leakage", () => {
  const weak = card({ id: "weak", rewardRates: { ...zeroRates, other: 1 } });
  const strong = card({ id: "strong", rewardRates: { ...zeroRates, other: 2 } });
  const s = spend({ other: 10_000 }); // weak ₹1,200/yr, strong ₹2,400/yr

  it("is the gap between the best eligible card and the best held card", () => {
    expect(leakage(s, [weak], [weak, strong])).toMatchObject({
      amount: 1200,
      bestEligibleId: "strong",
      bestHeldId: "weak",
      holdsBest: false,
    });
  });

  it("is 0 when the user already holds the best card", () => {
    expect(leakage(s, [strong, weak], [weak, strong])).toMatchObject({ amount: 0, holdsBest: true });
  });

  it("never goes negative (held card better than anything eligible)", () => {
    expect(leakage(s, [strong], [weak]).amount).toBe(0);
  });

  it("uses a ₹0 baseline when the user holds no card", () => {
    expect(leakage(s, [], [weak, strong])).toMatchObject({ amount: 2400, bestHeldId: null, holdsBest: false });
  });
});

describe("annualSpend", () => {
  it("sums monthly spend × 12, minus excluded categories", () => {
    expect(annualSpend(spend({ dining: 1000, fuel: 2000 }))).toBe(36_000);
    expect(annualSpend(spend({ dining: 1000, fuel: 2000 }), ["fuel"])).toBe(12_000);
  });
});

describe("formatInr", () => {
  it("groups in the Indian style", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(999)).toBe("₹999");
    expect(formatInr(1000)).toBe("₹1,000");
    expect(formatInr(123456)).toBe("₹1,23,456");
    expect(formatInr(12345678)).toBe("₹1,23,45,678");
    expect(formatInr(-4200)).toBe("−₹4,200");
    expect(formatInr(1234.6)).toBe("₹1,235");
  });
});
