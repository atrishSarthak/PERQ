import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { netAnnualValue } from "@perq/finance-engine";
import { catalogFileSchema, type CatalogCard, type QuizAnswersV2 } from "@perq/shared";
import { answersToMonthlySpend, recommend, toFinanceCard } from "../src/recommend";

const zero = { food_delivery: 0, online_shopping: 0, groceries: 0, dining: 0, fuel: 0, bills: 0, upi: 0, travel: 0, other: 0 };

function card(p: Partial<CatalogCard> & { id: string }): CatalogCard {
  return {
    name: p.id, issuer: "Bank", networks: ["Visa"], bucket: "entry_cashback", tier: null,
    cardType: "unsecured", fdMinAmount: null, lifetimeFree: false, upiEnabled: false,
    joiningFee: 0, annualFee: 0, feeWaiverSpend: null, waiverExcludes: [],
    rewardRates: { ...zero, other: 1 }, rewardCaps: {}, capGroups: [], rewardNotes: "",
    milestones: [], welcomeBenefitValue: 0, redemptionValue: null, coBrandPartner: null,
    minAge: 21, eligibleOccupations: ["salaried", "self_employed"], minMonthlyIncome: null,
    sourceUrl: "https://bank.example", sourceUpdatedAt: "2026-10-31", verified: true,
    ...p,
  };
}

const base: QuizAnswersV2 = {
  schemaVersion: 2, cardsHeld: [], occupation: "salaried", monthlyIncome: "50k_1l",
  monthlySpend: { food_delivery: "1k_3k", online_shopping: "1k_3k", groceries: "1k_3k", dining: "1k_3k", fuel: "lt_1k", bills: "1k_3k", upi: "1k_3k" },
  travelPerYear: "1_2", feeTolerance: "any", priorities: [], openToSecured: null,
};

const catalogue: CatalogCard[] = [
  card({ id: "secured-fd", cardType: "secured", bucket: "secured", fdMinAmount: 10000, eligibleOccupations: null, lifetimeFree: true, rewardRates: { ...zero, food_delivery: 1, online_shopping: 1, groceries: 1, dining: 1 } }),
  card({ id: "ltf-basic", lifetimeFree: true, bucket: "lifetime_free", eligibleOccupations: ["student", "salaried", "self_employed"], rewardRates: { ...zero, food_delivery: 1, online_shopping: 1, groceries: 1, dining: 1, bills: 1 } }),
  card({ id: "food-cobrand", joiningFee: 500, annualFee: 500, feeWaiverSpend: 200000, rewardRates: { ...zero, food_delivery: 10, online_shopping: 1, groceries: 1, dining: 1 }, rewardCaps: { food_delivery: 1500 } }),
  card({ id: "rupay-upi", networks: ["RuPay"], upiEnabled: true, bucket: "rupay_upi", joiningFee: 499, annualFee: 499, rewardRates: { ...zero, upi: 3, food_delivery: 1, online_shopping: 1 } }),
  card({ id: "premium", joiningFee: 2500, annualFee: 2500, rewardRates: { ...zero, food_delivery: 2, online_shopping: 2, groceries: 2, dining: 2, bills: 2, travel: 5 }, redemptionValue: 0.25 }),
  card({ id: "unverified-great", verified: false, rewardRates: { ...zero, food_delivery: 50 } }),
];

describe("recommend (handoff §1.8 fixtures)", () => {
  it("(a) a student on ₹15k sees only secured or lifetime-free cards", () => {
    const r = recommend({ ...base, occupation: "student", monthlyIncome: "below_25k", openToSecured: true }, catalogue);
    const ids = r.ranked.map((c) => c.cardId);
    expect(ids.sort()).toEqual(["ltf-basic", "secured-fd"]);
    for (const c of r.ranked) expect(c.flags.fdBacked || c.flags.lifetimeFree).toBe(true);
  });

  it("(b) ₹0-fee tolerance excludes every card with a fee", () => {
    const r = recommend({ ...base, feeTolerance: "zero" }, catalogue);
    for (const c of r.ranked) expect(c.fee.joiningFee + c.fee.annualFee).toBe(0);
    expect(r.ineligible.map((c) => c.cardId)).toEqual(expect.arrayContaining(["food-cobrand", "rupay-upi", "premium"]));
  });

  it("(c) heavy food-delivery spend ranks the food co-brand first", () => {
    const r = recommend({ ...base, monthlySpend: { ...base.monthlySpend, food_delivery: "6k_plus" } }, catalogue);
    expect(r.ranked[0]!.cardId).toBe("food-cobrand");
  });

  it("(d) heavy UPI spend ranks the RuPay card higher", () => {
    const low = recommend(base, catalogue).ranked.findIndex((c) => c.cardId === "rupay-upi");
    const high = recommend({ ...base, monthlySpend: { ...base.monthlySpend, upi: "6k_plus" } }, catalogue).ranked.findIndex(
      (c) => c.cardId === "rupay-upi"
    );
    expect(high).toBeLessThan(low);
  });

  it("(e) holding the best card means zero leakage", () => {
    const first = recommend(base, catalogue).ranked[0]!.cardId;
    const r = recommend({ ...base, cardsHeld: [first] }, catalogue);
    expect(r.leakage).toMatchObject({ amount: 0, holdsBest: true, hasCards: true });
    expect(r.leakage.message).toMatch(/already hold the best card/);
  });

  it("(e) holding a weaker card shows the gap in ₹", () => {
    const r = recommend({ ...base, cardsHeld: ["ltf-basic"] }, catalogue);
    const best = r.ranked[0]!;
    const held = r.ranked.find((c) => c.cardId === "ltf-basic")!;
    expect(r.leakage.amount).toBe(best.ongoingValue - held.ongoingValue);
    expect(r.leakage.message).toMatch(/leave about ₹[\d,]+ a year on the table/);
  });

  it("(f) priorities reorder only within ±10% and never change ₹ values", () => {
    const plain = recommend(base, catalogue).ranked;
    const withPriority = recommend({ ...base, priorities: ["travel", "dining"] }, catalogue).ranked;
    for (const c of withPriority) {
      const same = plain.find((p) => p.cardId === c.cardId)!;
      expect(c.ongoingValue).toBe(same.ongoingValue);
      expect(c.year1Value).toBe(same.year1Value);
      expect(c.breakdown).toEqual(same.breakdown);
    }
    // Any card moved above another must have been within 10% of it.
    for (let i = 0; i < withPriority.length; i++) {
      for (let j = i + 1; j < withPriority.length; j++) {
        const a = withPriority[i]!;
        const b = withPriority[j]!;
        if (a.ongoingValue < b.ongoingValue) {
          expect(a.ongoingValue * 1.1).toBeGreaterThanOrEqual(b.ongoingValue);
        }
      }
    }
  });

  it("never ranks an unverified card", () => {
    const r = recommend(base, catalogue);
    expect(r.ranked.map((c) => c.cardId)).not.toContain("unverified-great");
    expect(r.catalogue).toMatchObject({ total: 6, verified: 5 });
  });

  it("reports exactly finance-engine's numbers", () => {
    const r = recommend(base, catalogue);
    for (const c of r.ranked) {
      const fc = toFinanceCard(catalogue.find((x) => x.id === c.cardId)!);
      const spend = answersToMonthlySpend(base);
      expect(c.ongoingValue).toBe(netAnnualValue(spend, fc, { year: "ongoing" }).net);
      expect(c.year1Value).toBe(netAnnualValue(spend, fc, { year: 1 }).net);
    }
  });

  it("keeps secured cards out unless the user is open to an FD (students always see them)", () => {
    expect(recommend({ ...base, openToSecured: false }, catalogue).ranked.map((c) => c.cardId)).not.toContain("secured-fd");
    expect(recommend({ ...base, openToSecured: true }, catalogue).ranked.map((c) => c.cardId)).toContain("secured-fd");
    expect(
      recommend({ ...base, occupation: "student", monthlyIncome: "below_25k", openToSecured: null }, catalogue).ranked.map((c) => c.cardId)
    ).toContain("secured-fd");
  });
});

describe("recommend on the real 40-card catalogue", () => {
  const real = catalogFileSchema.parse(
    JSON.parse(readFileSync(resolve(__dirname, "../../db/data/cards.json"), "utf-8"))
  );

  it("ranks only verified cards and returns integer rupees", () => {
    const r = recommend(base, real);
    expect(r.ranked.length).toBeGreaterThan(10);
    for (const c of r.ranked) {
      expect(real.find((x) => x.id === c.cardId)!.verified).toBe(true);
      expect(Number.isInteger(c.ongoingValue) && Number.isInteger(c.year1Value)).toBe(true);
    }
  });

  it("puts a food co-brand or food-heavy card first for a heavy Swiggy/Zomato user on a modest budget", () => {
    const r = recommend(
      { ...base, feeTolerance: "upto_1000", monthlySpend: { ...base.monthlySpend, food_delivery: "6k_plus" } },
      real
    );
    const top = real.find((c) => c.id === r.ranked[0]!.cardId)!;
    expect((top.rewardRates.food_delivery ?? 0) >= 4).toBe(true);
  });
});
