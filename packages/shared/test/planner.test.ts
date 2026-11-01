import { describe, expect, it } from "vitest";
import {
  emberEventSchema,
  emiSpecSchema,
  offerSpecSchema,
  planInputSchema,
  planPatchSchema,
  planResultSchema,
  threadRefSchema,
  type OptionResult,
  type PlanResult,
} from "../src";

describe("planner input schemas", () => {
  it("needs a percent or flat amount, except for no-cost EMI", () => {
    expect(offerSpecSchema.safeParse({ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1,500 off" }).success).toBe(true);
    expect(offerSpecSchema.safeParse({ type: "cashback", rawText: "Cashback" }).success).toBe(false);
    expect(offerSpecSchema.safeParse({ type: "no_cost_emi", rawText: "No cost EMI" }).success).toBe(true);
    expect(offerSpecSchema.safeParse({ type: "coupon", percent: 120, rawText: "x" }).success).toBe(false);
  });

  it("needs an EMI rate unless it's no-cost", () => {
    expect(emiSpecSchema.safeParse({ tenureMonths: 6, interestRatePa: 15 }).success).toBe(true);
    expect(emiSpecSchema.safeParse({ tenureMonths: 6, noCost: true, processingFee: 199 }).success).toBe(true);
    expect(emiSpecSchema.safeParse({ tenureMonths: 6 }).success).toBe(false);
    expect(emiSpecSchema.safeParse({ tenureMonths: 0, interestRatePa: 15 }).success).toBe(false);
  });

  it("defaults offers and EMI options, and rejects bad prices and categories", () => {
    const ok = planInputSchema.parse({ item: { name: "Phone", category: "online_shopping" }, price: 59900 });
    expect(ok.offers).toEqual([]);
    expect(ok.emiOptions).toEqual([]);
    expect(planInputSchema.safeParse({ item: { name: "Phone", category: "online_shopping" }, price: 0 }).success).toBe(false);
    expect(planInputSchema.safeParse({ item: { name: "Phone", category: "gadgets" }, price: 100 }).success).toBe(false);
    expect(planInputSchema.safeParse({ item: { name: "Phone", category: "other" }, price: 99.5 }).success).toBe(false);
  });

  it("refuses an empty patch", () => {
    expect(planPatchSchema.safeParse({}).success).toBe(false);
    expect(planPatchSchema.safeParse({ status: "bought" }).success).toBe(true);
  });
});

const upi: OptionResult = {
  id: "upi",
  kind: "upi",
  cardAccountId: null,
  catalogueCardId: null,
  label: "UPI or debit card",
  purchaseDate: "2026-11-22",
  stickerPrice: 59900,
  offerDiscount: 0,
  effectivePrice: 59900,
  rewards: 0,
  extraCosts: 0,
  netCost: 59900,
  savingVsUpi: 0,
  offersApplied: [],
  offersSkipped: [{ rawText: "₹1,500 off with HDFC cards", reason: "Only on HDFC Bank cards" }],
  interestFreeDays: null,
  billedOn: null,
  dueOn: null,
  utilisationAfterPct: null,
  blocked: false,
  flags: [],
  rank: 2,
};

const result: PlanResult = {
  verdict: "go_with_timing",
  verdictReason: "timing_gain",
  headline: "Go ahead, on 16 Nov",
  recommended: { ...upi, id: "card:a1:best", kind: "card_full", cardAccountId: "a1", catalogueCardId: "hdfc-millennia", label: "HDFC Millennia", purchaseDate: "2026-11-16", offerDiscount: 1500, effectivePrice: 58400, rewards: 584, netCost: 57816, savingVsUpi: 2084, offersApplied: [{ rawText: "₹1,500 off", discount: 1500 }], offersSkipped: [], interestFreeDays: 49, billedOn: "2026-12-15", dueOn: "2027-01-04", utilisationAfterPct: 58, flags: ["util_over_30"], rank: 1 },
  options: [upi],
  affordability: { leftThisMonth: 70000, afterPurchase: 10100, neededByDate: "2027-01-04", neededAmount: 58400, sizeLabel: "large", goalImpacts: [], basis: "budget", monthlyIncome: 75000 },
  timing: { cardAccountId: "a1", bestDate: "2026-11-16", floatToday: 19, floatBest: 49, extraDays: 30 },
  credit: { cardAccountId: "a1", before: 12, after: 58, payToStayUnder30: 35000, nextStatementDate: "2026-11-15" },
  missingData: [],
  assumptions: ["Rewards use the card's published rate"],
  asOf: "2026-11-01",
  engineVersion: 1,
};

describe("planResultSchema", () => {
  it("round-trips a plan result", () => {
    expect(planResultSchema.parse(result)).toEqual(result);
  });
  it("rejects an unknown verdict or flag", () => {
    expect(planResultSchema.safeParse({ ...result, verdict: "dont_buy" }).success).toBe(false);
    expect(planResultSchema.safeParse({ ...result, options: [{ ...upi, flags: ["bad_flag"] }] }).success).toBe(false);
  });
  it("is carried on the plan SSE event", () => {
    expect(emberEventSchema.safeParse({ type: "plan", planId: "p1", result, explanation: "Go ahead.", explanationSource: "template" }).success).toBe(true);
    expect(emberEventSchema.safeParse({ type: "planConfirm", draft: { price: 45000 }, missing: ["item"] }).success).toBe(true);
  });
});

describe("plan threads", () => {
  it("accepts plan:<id>", () => {
    expect(threadRefSchema.safeParse("plan:abc-123").success).toBe(true);
    expect(threadRefSchema.safeParse("plan:").success).toBe(false);
  });
});
