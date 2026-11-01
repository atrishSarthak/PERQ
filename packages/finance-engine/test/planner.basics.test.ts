import { describe, expect, it } from "vitest";
import {
  applyOffer,
  applyOffers,
  bankKey,
  bestPurchaseDate,
  emiInstalment,
  emiTrueCost,
  floatDays,
  rewardFor,
  type PlanCardTerms,
} from "../src";

const card = (statementDay: number | null, dueDay: number | null) => ({ statementDay, dueDay });

describe("floatDays", () => {
  it("bills a purchase on the statement day itself on that statement", () => {
    expect(floatDays(card(15, 4), "2026-11-15")).toEqual({ purchaseDate: "2026-11-15", billedOn: "2026-11-15", dueOn: "2026-12-04", days: 19 });
  });
  it("bills the day after on the next statement", () => {
    expect(floatDays(card(15, 4), "2026-11-16")).toMatchObject({ billedOn: "2026-12-15", dueOn: "2027-01-04", days: 49 });
  });
  it("puts the due date in the same month when the due day is after the statement day", () => {
    expect(floatDays(card(4, 24), "2026-11-05")).toMatchObject({ billedOn: "2026-12-04", dueOn: "2026-12-24", days: 49 });
  });
  it("crosses the year end", () => {
    expect(floatDays(card(26, 15), "2026-12-27")).toMatchObject({ billedOn: "2027-01-26", dueOn: "2027-02-15", days: 50 });
  });
  it("clamps statement day 31 to short months, including February", () => {
    expect(floatDays(card(31, 20), "2027-02-10")).toMatchObject({ billedOn: "2027-02-28", dueOn: "2027-03-20" });
    expect(floatDays(card(31, 20), "2027-03-01")).toMatchObject({ billedOn: "2027-03-31", dueOn: "2027-04-20" });
    expect(floatDays(card(31, 20), "2026-11-30")).toMatchObject({ billedOn: "2026-11-30", dueOn: "2026-12-20", days: 20 });
    expect(floatDays(card(30, 18), "2028-02-29")).toMatchObject({ billedOn: "2028-02-29", dueOn: "2028-03-18" }); // leap year
  });
  it("clamps a due day of 31", () => {
    expect(floatDays(card(10, 31), "2027-02-05")).toMatchObject({ billedOn: "2027-02-10", dueOn: "2027-02-28" });
  });
  it("needs both days", () => {
    expect(floatDays(card(null, 4), "2026-11-16")).toBeNull();
    expect(floatDays(card(15, null), "2026-11-16")).toBeNull();
  });
});

describe("bestPurchaseDate", () => {
  it("finds the day after the statement inside the window", () => {
    const b = bestPurchaseDate(card(15, 4), "2026-11-10", "2026-11-24")!;
    expect(b).toMatchObject({ bestDate: "2026-11-16", floatToday: 24, floatBest: 49, extraDays: 25 });
  });
  it("can't reach the statement when the window ends first", () => {
    const b = bestPurchaseDate(card(15, 4), "2026-11-01", "2026-11-14")!;
    expect(b.bestDate).toBe("2026-11-01");
    expect(b.extraDays).toBe(0);
  });
  it("reports small gains so the caller can drop advice under 10 days", () => {
    const b = bestPurchaseDate(card(15, 4), "2026-11-12", "2026-11-26")!;
    expect(b.bestDate).toBe("2026-11-16");
    expect(b.extraDays).toBe(27); // 22 days → 49
    const late = bestPurchaseDate(card(15, 4), "2026-11-17", "2026-12-01")!;
    expect(late.extraDays).toBe(0); // already just after the statement: buying today is best
  });
  it("is null without statement dates", () => {
    expect(bestPurchaseDate(card(null, null), "2026-11-01", "2026-11-15")).toBeNull();
  });
});

describe("bankKey", () => {
  it("normalises loose bank names", () => {
    expect(bankKey("HDFC Bank")).toBe("hdfc");
    expect(bankKey("SBI Cards")).toBe("sbi");
    expect(bankKey("SBI Card")).toBe("sbi");
    expect(bankKey("State Bank of India")).toBe("sbi");
    expect(bankKey("IDFC FIRST Bank")).toBe("idfc");
    expect(bankKey("American Express")).toBe("amex");
    expect(bankKey("")).toBeNull();
  });
});

const hdfc = { issuer: "HDFC Bank", label: "HDFC Millennia", name: "HDFC Bank Millennia Credit Card", networks: ["Visa", "Mastercard"] };
const ace = { issuer: "Axis Bank", label: "Axis ACE", name: "Axis Bank ACE Credit Card", networks: ["Visa"] };

describe("applyOffer", () => {
  const flat = { type: "instant_discount" as const, bank: "HDFC", flat: 1500, minOrder: 30000, rawText: "₹1,500 off on HDFC cards" };
  it("applies a flat bank offer to the matching bank", () => {
    expect(applyOffer(flat, hdfc, 59900)).toEqual({ eligible: true, discount: 1500, reason: "Applies" });
  });
  it("refuses other banks and UPI", () => {
    expect(applyOffer(flat, ace, 59900)).toMatchObject({ eligible: false, reason: "Only on HDFC cards" });
    expect(applyOffer(flat, null, 59900)).toMatchObject({ eligible: false });
  });
  it("respects the minimum order", () => {
    expect(applyOffer(flat, hdfc, 25000)).toMatchObject({ eligible: false, reason: "Needs an order of at least ₹30,000" });
  });
  it("caps a percent offer", () => {
    expect(applyOffer({ type: "instant_discount", bank: "Axis", percent: 10, maxDiscount: 1000, rawText: "10% up to ₹1,000" }, ace, 24999).discount).toBe(1000);
    expect(applyOffer({ type: "instant_discount", bank: "Axis", percent: 10, rawText: "10%" }, ace, 4999).discount).toBe(499);
  });
  it("can't confirm a network for a card sold on two networks", () => {
    expect(applyOffer({ type: "instant_discount", bank: "HDFC", network: "Visa", flat: 500, rawText: "x" }, hdfc, 9000)).toMatchObject({
      eligible: false,
      reason: "Couldn't confirm this card qualifies",
    });
    expect(applyOffer({ type: "instant_discount", network: "Visa", flat: 500, rawText: "x" }, ace, 9000).eligible).toBe(true);
  });
  it("can't confirm a card name it doesn't know", () => {
    expect(applyOffer({ type: "cashback", cardNames: ["Regalia"], percent: 5, rawText: "x" }, hdfc, 9000).eligible).toBe(false);
    expect(applyOffer({ type: "cashback", cardNames: ["Millennia"], percent: 5, rawText: "x" }, hdfc, 9000).eligible).toBe(true);
  });
  it("only applies EMI-only offers on EMI, and leaves no-cost EMI to the EMI cost", () => {
    const emiOnly = { type: "instant_discount" as const, bank: "HDFC", flat: 2000, emiOnly: true, rawText: "₹2,000 off on EMI" };
    expect(applyOffer(emiOnly, hdfc, 59900)).toMatchObject({ eligible: false, reason: "Only when you pay by EMI" });
    expect(applyOffer(emiOnly, hdfc, 59900, { emi: true }).discount).toBe(2000);
    expect(applyOffer({ type: "no_cost_emi", rawText: "No cost EMI" }, hdfc, 59900, { emi: true }).eligible).toBe(false);
  });
  it("gives an unrestricted coupon to everyone, UPI included", () => {
    expect(applyOffer({ type: "coupon", flat: 200, rawText: "SAVE200" }, null, 1999).discount).toBe(200);
  });
});

describe("applyOffers", () => {
  it("doesn't stack two bank offers of the same type but adds a coupon", () => {
    const r = applyOffers(
      [
        { type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "A" },
        { type: "instant_discount", bank: "HDFC", percent: 5, maxDiscount: 2500, rawText: "B" },
        { type: "coupon", flat: 300, rawText: "C" },
      ],
      hdfc,
      59900
    );
    expect(r.discount).toBe(2800);
    expect(r.applied.map((a) => a.rawText).sort()).toEqual(["B", "C"]);
    expect(r.skipped).toEqual([{ rawText: "A", reason: "Doesn't stack with a bigger offer of the same kind" }]);
  });
});

const terms = (over: Partial<PlanCardTerms> = {}): PlanCardTerms => ({
  id: "axis-ace",
  name: "Axis ACE",
  issuer: "Axis Bank",
  networks: ["Visa"],
  rewardRates: { online_shopping: 1.5, bills: 5, food_delivery: 4, other: 1.5 },
  redemptionValue: null,
  feeWaiverSpend: null,
  annualFee: 499,
  rewardCaps: {},
  capGroups: [{ categories: ["bills", "food_delivery"], monthlyCap: 500 }],
  emiRewards: false,
  ...over,
});

describe("rewardFor", () => {
  it("uses the category rate, rounded down", () => {
    expect(rewardFor(terms(), "online_shopping", 59900)).toMatchObject({ reward: 898, ratePct: 1.5, capped: false });
  });
  it("maps Step 2 categories and earns nothing on rent", () => {
    expect(rewardFor(terms(), "entertainment", 1000).reward).toBe(15);
    expect(rewardFor(terms(), "rent", 20000).reward).toBe(0);
  });
  it("respects what's left of a shared cap this month", () => {
    const r = rewardFor(terms(), "bills", 10000, { monthSpendByCategory: { food_delivery: 5000 } });
    expect(r).toMatchObject({ reward: 300, capped: true }); // 500 − 5,000×4% = 300 left
    expect(rewardFor(terms(), "bills", 10000, { monthSpendByCategory: { bills: 20000 } }).reward).toBe(0);
  });
  it("respects a per-category and a total cap", () => {
    expect(rewardFor(terms({ rewardCaps: { online_shopping: 500 } }), "online_shopping", 59900).reward).toBe(500);
    expect(rewardFor(terms({ rewardCaps: { total: 600 } }), "online_shopping", 59900, { monthSpendByCategory: { other: 10000 } }).reward).toBe(450);
  });
  it("loses rewards on EMI unless the card keeps them", () => {
    expect(rewardFor(terms(), "online_shopping", 59900, { emi: true })).toMatchObject({ reward: 0, lostToEmi: true, fullPaymentReward: 898 });
    expect(rewardFor(terms({ emiRewards: true }), "online_shopping", 59900, { emi: true }).reward).toBe(898);
  });
});

describe("emiTrueCost", () => {
  it("prices a regular EMI with GST on interest and fee", () => {
    const e = emiTrueCost({ tenureMonths: 12, interestRatePa: 15, processingFee: 199 }, 60000);
    expect(e.monthlyInstalment).toBe(Math.round(emiInstalment(60000, 15, 12)));
    expect(e.monthlyInstalment).toBe(5415);
    expect(e.totalInterest).toBe(4986);
    expect(e.gstOnInterest).toBe(897);
    expect(e.processingFeeWithGst).toBe(235);
    expect(e.extraCostVsFullPayment).toBe(4986 + 897 + 235);
    expect(e.blockedLimit).toBe(60000);
    expect(e.assumedRatePa).toBeNull();
  });
  it("still costs money on no-cost EMI with a fee", () => {
    const e = emiTrueCost({ tenureMonths: 6, noCost: true, processingFee: 199 }, 24999, { rewardsLost: 374 });
    expect(e.noCost).toBe(true);
    expect(e.monthlyInstalment).toBe(4167);
    expect(e.totalInterest).toBe(e.upfrontDiscount); // net interest ≈ 0
    expect(e.totalInterest).toBeGreaterThan(1000);
    expect(e.gstOnInterest).toBe(Math.round(e.totalInterest * 0.18));
    expect(e.processingFeeWithGst).toBe(235);
    expect(e.extraCostVsFullPayment).toBeGreaterThanOrEqual(500);
    expect(e.assumedRatePa).toBe(15);
    expect(e.lines.map((l) => l.label)).toEqual([
      "Interest charged by the bank",
      "No-cost discount (cancels the interest)",
      "GST on the interest (18%)",
      "Processing fee incl. GST",
      "Rewards you don't earn on EMI",
    ]);
    expect(e.blockedLimit).toBeLessThan(24999);
    expect(e.extraCostVsFullPayment).toBe(e.lines.reduce((s, l) => s + l.amount, 0));
  });
  it("costs only the GST on interest with no fee and no rewards", () => {
    const e = emiTrueCost({ tenureMonths: 3, noCost: true, interestRatePa: 14 }, 30000);
    expect(e.processingFeeWithGst).toBe(0);
    expect(e.extraCostVsFullPayment).toBe(e.gstOnInterest);
    expect(e.extraCostVsFullPayment).toBeGreaterThan(0);
  });
  it("handles a 0% EMI", () => {
    expect(emiTrueCost({ tenureMonths: 4, interestRatePa: 0 }, 10000)).toMatchObject({ monthlyInstalment: 2500, totalInterest: 0, extraCostVsFullPayment: 0 });
  });
});
