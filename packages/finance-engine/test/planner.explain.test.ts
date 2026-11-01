import { describe, expect, it } from "vitest";
import { planInputSchema, type PlanInput } from "@perq/shared";
import { planNarration, planPurchase, planTemplateExplanation, validatePlanExplanation, type PlanCard, type PlanCardTerms, type PlanContext } from "../src";

const T = (id: string, issuer: string, rate: number): PlanCardTerms => ({
  id, name: id, issuer, networks: ["Visa"], rewardRates: { online_shopping: rate, travel: rate, other: rate }, redemptionValue: null,
  feeWaiverSpend: null, annualFee: 0, rewardCaps: {}, capGroups: [], emiRewards: false,
});
const card = (id: string, t: PlanCardTerms, over: Partial<PlanCard> = {}): PlanCard => ({
  cardAccountId: id, label: id === "h" ? "HDFC Millennia" : "Axis ACE", issuer: t.issuer, terms: t, statementDay: 25, dueDay: 14,
  creditLimit: 200000, balance: 10000, hasUnreconciled: false, monthSpendByCategory: {}, ...over,
});
const HDFC = card("h", T("hdfc-millennia", "HDFC Bank", 1));
const ACE = card("a", T("axis-ace", "Axis Bank", 1.5), { statementDay: 4, dueDay: 24 });
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  today: "2026-11-22", cards: [HDFC, ACE], leftToSpend: 100000, monthSpend: 20000, goals: [{ id: "g", name: "Goa trip fund", monthlyNeeded: 4500 }],
  monthlyIncome: 150000, averageMonthlySpend: 40000, hasStatements: true, ...over,
});
const input = (o: Partial<PlanInput> & { price: number }) => planInputSchema.parse({ item: { name: "Phone", category: "online_shopping" }, ...o });

const scenarios = {
  timing: planPurchase(input({ price: 59900, offers: [{ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1,500 off" }] }), ctx()),
  emi: planPurchase(input({ price: 24999, item: { name: "Laptop", category: "online_shopping" }, emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199 }] }), ctx()),
  wait: planPurchase(input({ price: 38000, item: { name: "Trip package", category: "travel" } }), ctx({ leftToSpend: 28000 })),
  slip: planPurchase(input({ price: 60000, needBy: "2026-11-25" }), ctx({ leftToSpend: 20000, monthlyIncome: 60000 })),
  util: planPurchase(input({ price: 30000 }), ctx({ cards: [{ ...ACE, creditLimit: 40000 }, { ...HDFC, creditLimit: 35000 }] })),
  go: planPurchase(input({ price: 2000 }), ctx({ cards: [{ ...ACE, statementDay: 21, dueDay: 10 }] })),
  bare: planPurchase(input({ price: 2000 }), ctx({ cards: [], hasStatements: false, leftToSpend: null, monthlyIncome: null })),
};

describe("planTemplateExplanation", () => {
  it.each(Object.entries(scenarios))("%s: passes its own validator", (_name, r) => {
    const text = planTemplateExplanation(r);
    expect(validatePlanExplanation(text, r)).toEqual({ ok: true });
  });
  it("leads with the verdict and the one action", () => {
    expect(scenarios.timing.verdict).toBe("go_with_timing");
    expect(planTemplateExplanation(scenarios.timing)).toMatch(/^Go ahead, but on 26 Nov\. Buying then gives you 49 interest-free days instead of 22/);
    expect(scenarios.emi.verdict).toBe("rethink_payment");
    expect(planTemplateExplanation(scenarios.emi)).toMatch(/^Pay a different way\. The EMI costs ₹\d[\d,]* more than paying in full/);
    expect(planTemplateExplanation(scenarios.wait)).toMatch(/^Better to wait\. It costs ₹38,000 and you have ₹28,000 left/);
    expect(planTemplateExplanation(scenarios.slip)).toContain("push your Goa trip fund goal back by about");
    expect(planTemplateExplanation(scenarios.util)).toContain("above 70% of its limit");
    expect(planTemplateExplanation(scenarios.bare)).toContain("You haven't added any cards");
  });
});

describe("validatePlanExplanation", () => {
  const r = scenarios.timing;
  const good = "Go ahead, but on 26 Nov. You'd get 49 interest-free days instead of 22 on your HDFC Millennia. After the ₹1,500 offer and rewards it costs ₹57,816.";
  it("accepts grounded text", () => {
    expect(r.recommended.netCost).toBe(57816);
    expect(validatePlanExplanation(good, r)).toEqual({ ok: true });
  });
  it("rejects a number that isn't in the result", () => {
    expect(validatePlanExplanation(good.replace("57,816", "57,000"), r)).toMatchObject({ ok: false, reason: "number not in result: 57000" });
    expect(validatePlanExplanation("Go ahead on 26 Nov. It's about ₹58k all in.", r)).toMatchObject({ ok: false });
  });
  it("rejects a verdict that doesn't match the engine", () => {
    expect(validatePlanExplanation("Better to wait. Your HDFC statement closes on 25 Nov.", r)).toMatchObject({ ok: false, reason: "verdict not first" });
    expect(validatePlanExplanation("Go ahead, but on 26 Nov. Or better to wait a month.", r)).toMatchObject({ ok: false, reason: "contradicts verdict" });
  });
  it("rejects judging the item, urgency and investment advice", () => {
    expect(validatePlanExplanation("Go ahead, but on 26 Nov. Though honestly it's a luxury.", r)).toMatchObject({ ok: false });
    expect(validatePlanExplanation("Go ahead, but on 26 Nov. Hurry, prices change.", r)).toMatchObject({ ok: false });
    expect(validatePlanExplanation("Go ahead, but on 26 Nov. Consider an investment instead.", r)).toMatchObject({ ok: false });
    expect(validatePlanExplanation("Go ahead, but on 26 Nov!", r)).toMatchObject({ ok: false });
  });
  it("needs 2–4 sentences", () => {
    expect(validatePlanExplanation("Go ahead, but on 26 Nov.", r)).toMatchObject({ ok: false, reason: "sentences: 1" });
    expect(validatePlanExplanation("Go ahead. A. B. C. D.", r)).toMatchObject({ ok: false, reason: "sentences: 5" });
  });
});

describe("planNarration", () => {
  it("lists only the steps that applied", () => {
    expect(planNarration(scenarios.emi, "November")).toEqual([
      "Checked your budget for November",
      "Compared your 2 cards",
      "Looked at your statement dates", // the recommendation is HDFC in full on its best day
      "Checked your credit limit",
      "Worked out the real cost of the no-cost EMI",
      "Writing your answer",
    ]);
    expect(planNarration(scenarios.timing, "November")).toContain("Looked at your statement dates");
    expect(planNarration(scenarios.bare, "November")).toEqual(["Writing your answer"]);
  });
});
