import { describe, expect, it } from "vitest";
import { planInputSchema } from "@perq/shared";
import { matchFromDedupeKey, matchPlanPurchase, planNudges, planOutcome, planPurchase, planPurchaseMatchCandidate, sameMerchant, type MatchableTxn, type PlanCard } from "../src";

// Step 3 §8: a statement line that looks like a planned purchase.

const plan = { id: "p1", price: 59900, effectivePrice: 58400, merchant: "Kartly", category: "online_shopping", createdDay: "2026-11-10" };
const txn = (over: Partial<MatchableTxn> = {}): MatchableTxn => ({
  id: "t1",
  date: "2026-11-16",
  merchant: "KARTLY INTERNET PVT",
  amount: 58400,
  direction: "debit",
  kind: "purchase",
  category: "online_shopping",
  ...over,
});

describe("matchPlanPurchase", () => {
  it("matches a debit within ±5% of the price, within 30 days, at the shop", () => {
    expect(matchPlanPurchase(plan, [txn()])?.id).toBe("t1");
    expect(matchPlanPurchase(plan, [txn({ amount: 62890 })])?.id).toBe("t1"); // +5% of the price
    expect(matchPlanPurchase(plan, [txn({ amount: 54000 })])).toBeNull(); // over 5% under both
  });

  it("or in the same category at another shop", () => {
    expect(matchPlanPurchase(plan, [txn({ merchant: "PhoneHub" })])?.id).toBe("t1");
    expect(matchPlanPurchase(plan, [txn({ merchant: "PhoneHub", category: "electronics" })])).toBeNull();
  });

  it("only purchases, only after the plan, only within 30 days", () => {
    expect(matchPlanPurchase(plan, [txn({ direction: "credit" })])).toBeNull();
    expect(matchPlanPurchase(plan, [txn({ kind: "refund" })])).toBeNull();
    expect(matchPlanPurchase(plan, [txn({ date: "2026-11-09" })])).toBeNull();
    expect(matchPlanPurchase(plan, [txn({ date: "2026-12-10" })])?.id).toBe("t1");
    expect(matchPlanPurchase(plan, [txn({ date: "2026-12-11" })])).toBeNull();
  });

  it("picks the closest amount", () => {
    expect(matchPlanPurchase(plan, [txn({ id: "far", amount: 60900 }), txn({ id: "near", amount: 58500 })])?.id).toBe("near");
  });

  it("merchant names match loosely, but not on tiny fragments", () => {
    expect(sameMerchant("Kartly", "KARTLY*ORDER 123")).toBe(true);
    expect(sameMerchant("Ab", "ABC Store")).toBe(false);
    expect(sameMerchant(null, "Kartly")).toBe(false);
  });
});

describe("planOutcome", () => {
  const card: PlanCard = { cardAccountId: "axis", label: "Axis ACE", issuer: "Axis Bank", terms: { id: "axis-ace", name: "Axis ACE", issuer: "Axis Bank", networks: ["Visa"], rewardRates: { online_shopping: 1.5, other: 1.5 }, redemptionValue: null, feeWaiverSpend: null, annualFee: 0, rewardCaps: {}, capGroups: [], emiRewards: false }, statementDay: 25, dueDay: 14, creditLimit: 500000, balance: 0, hasUnreconciled: false, monthSpendByCategory: {} };
  const r = planPurchase(planInputSchema.parse({ item: { name: "Phone", category: "online_shopping" }, price: 59900 }), {
    today: "2026-11-22", cards: [card], leftToSpend: 100000, monthSpend: 0, goals: [], monthlyIncome: null, averageMonthlySpend: null, hasStatements: true,
  });

  it("credits the saving and the extra days when the plan was followed", () => {
    expect(r.recommended.purchaseDate).toBe("2026-11-26");
    expect(planOutcome(r, { date: "2026-11-26", cardAccountId: "axis" })).toEqual({ usedRecommendedCard: true, usedRecommendedDay: true, savedVsUpi: r.recommended.savingVsUpi, extraInterestFreeDays: r.timing!.extraDays });
  });

  it("no saving for another card; no extra days when bought early", () => {
    expect(planOutcome(r, { date: "2026-11-26", cardAccountId: "other" })).toMatchObject({ usedRecommendedCard: false, savedVsUpi: null, extraInterestFreeDays: null });
    expect(planOutcome(r, { date: "2026-11-23", cardAccountId: "axis" })).toMatchObject({ usedRecommendedDay: false, extraInterestFreeDays: null });
  });
});

describe("the match nudge", () => {
  const c = planPurchaseMatchCandidate({ planId: "p1", itemName: "Nova X15", transaction: { id: "t1", date: "2026-11-16", merchant: "Kartly", amount: 58400, cardAccountId: "axis" }, cardLabel: "Axis ACE", expiresAt: "2026-12-01T00:00:00.000Z" });

  it("asks, with the purchase's own numbers, and carries both ids", () => {
    expect(c.templateBody).toBe("Looks like you bought the Nova X15 on 16 Nov: ₹58,400 at Kartly on your Axis ACE. Mark this plan as done?");
    expect(matchFromDedupeKey(c.dedupeKey)).toEqual({ planId: "p1", transactionId: "t1" });
  });

  it("doesn't count against the daily cap", () => {
    const now = new Date("2026-11-22T10:00:00+05:30");
    const sent = (ruleId: string, i: number) => ({ ruleId, dedupeKey: `${ruleId}:${i}`, status: "sent", sentAt: now.toISOString(), dismissedAt: null, actedAt: null, createdAt: now.toISOString() });
    const plan2 = planNudges({ candidates: [], queued: [], history: [sent("plan_purchase_match", 1), sent("plan_purchase_match", 2)], now });
    expect(plan2.capRemaining).toBe(2);
    expect(planNudges({ candidates: [], queued: [], history: [sent("due_soon", 1)], now }).capRemaining).toBe(1);
  });
});
