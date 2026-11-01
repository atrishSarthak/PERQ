import { describe, expect, it } from "vitest";
import { planInputSchema, planResultSchema, type PlanInput } from "@perq/shared";
import { PlanChoiceError, planPurchase, planTemplateExplanation, validatePlanExplanation, type PlanCard, type PlanCardTerms, type PlanContext } from "../src";

// What-if picks (§9): the user chooses a card, a day or an EMI and the plan
// is judged on that choice.

const TODAY = "2026-11-22";

const terms = (id: string, issuer: string, rates: Record<string, number>, over: Partial<PlanCardTerms> = {}): PlanCardTerms => ({
  id,
  name: id,
  issuer,
  networks: ["Visa"],
  rewardRates: rates,
  redemptionValue: null,
  feeWaiverSpend: null,
  annualFee: 0,
  rewardCaps: {},
  capGroups: [],
  emiRewards: false,
  ...over,
});
const HDFC = terms("hdfc-millennia", "HDFC Bank", { online_shopping: 1, other: 1 });
const SBI = terms("sbi-cashback", "SBI Card", { online_shopping: 5, other: 1 }, { capGroups: [{ categories: ["online_shopping"], monthlyCap: 2000 }] });
const ACE = terms("axis-ace", "Axis Bank", { online_shopping: 1.5, travel: 1.5, other: 1.5 });

const card = (id: string, t: PlanCardTerms | null, over: Partial<PlanCard> = {}): PlanCard => ({
  cardAccountId: id,
  label: t?.id ?? id,
  issuer: t?.issuer ?? "Some Bank",
  terms: t,
  statementDay: 25,
  dueDay: 14,
  creditLimit: 200000,
  balance: 10000,
  hasUnreconciled: false,
  monthSpendByCategory: {},
  ...over,
});

const input = (over: Partial<PlanInput> & { price: number }): PlanInput =>
  planInputSchema.parse({ item: { name: "Phone", category: "online_shopping" }, offers: [], emiOptions: [], ...over });

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  today: TODAY,
  cards: [],
  leftToSpend: 100000,
  monthSpend: 20000,
  goals: [],
  monthlyIncome: 150000,
  averageMonthlySpend: 40000,
  hasStatements: true,
  ...over,
});


const noDates = { statementDay: null, dueDay: null };
const ok = (r: ReturnType<typeof planPurchase>) => {
  planResultSchema.parse(r);
  expect(validatePlanExplanation(planTemplateExplanation(r), r)).toEqual({ ok: true });
};

describe("planPurchase with a what-if pick", () => {
  const cards = [card("hdfc", HDFC, noDates), card("sbi", SBI, noDates), card("ace", ACE, noDates)];
  const phone = input({ price: 30000 });

  it("without a pick, nothing changes and there's no `chosen`", () => {
    expect(planPurchase(phone, ctx({ cards }), {})).toEqual(planPurchase(phone, ctx({ cards })));
    expect(planPurchase(phone, ctx({ cards })).chosen).toBeUndefined();
  });

  it("a card ₹500 or more dearer than the best is a rethink, and the best stays recommended", () => {
    const r = planPurchase(phone, ctx({ cards }), { cardAccountId: "hdfc" });
    expect(r.verdict).toBe("rethink_payment");
    expect(r.verdictReason).toBe("costly_payment");
    expect(r.recommended.cardAccountId).toBe("sbi");
    expect(r.chosen).toMatchObject({ option: { cardAccountId: "hdfc" }, extraCost: 1200 });
    ok(r);
    expect(planTemplateExplanation(r)).toContain("₹1,200 more");
  });

  it("a card within ₹500 of the best is honoured", () => {
    const r = planPurchase(input({ price: 10000 }), ctx({ cards }), { cardAccountId: "ace" });
    expect(r.recommended.cardAccountId).toBe("ace");
    expect(r.verdict).toBe("go");
    expect(r.chosen!.extraCost).toBe(0);
    ok(r);
  });

  it("UPI can be picked, and is a rethink when a card saves ₹500+", () => {
    const r = planPurchase(phone, ctx({ cards }), { cardAccountId: "upi" });
    expect(r.chosen!.option.kind).toBe("upi");
    expect(r.verdict).toBe("rethink_payment");
    ok(r);
    const small = planPurchase(input({ price: 2000 }), ctx({ cards }), { cardAccountId: "upi" });
    expect(small.recommended.kind).toBe("upi");
    expect(small.verdict).toBe("go");
  });

  it("a card that goes over 70% when a healthier one exists is a rethink", () => {
    // SBI saves ₹350 more on ₹10,000 but goes to 77%: under ₹500, so ACE ranks first.
    const tight = [card("sbi", SBI, { ...noDates, creditLimit: 13000, balance: 0 }), card("ace", ACE, noDates)];
    const r = planPurchase(input({ price: 10000 }), ctx({ cards: tight }), { cardAccountId: "sbi" });
    expect(r.verdict).toBe("rethink_payment");
    expect(r.verdictReason).toBe("chosen_high_util");
    expect(r.recommended.cardAccountId).toBe("ace");
    ok(r);
  });

  it("a day that wasn't ranked is built for that card; a 10+ day gain is go_with_timing", () => {
    const dated = [card("hdfc", HDFC)];
    const r = planPurchase(phone, ctx({ cards: dated }), { cardAccountId: "hdfc", purchaseDate: "2026-11-28" });
    expect(r.recommended.id).toBe("card:hdfc:picked");
    expect(r.recommended.purchaseDate).toBe("2026-11-28");
    expect(r.recommended.interestFreeDays).toBe(47);
    expect(r.options).toContain(r.recommended);
    expect(r.verdict).toBe("go_with_timing");
    ok(r);
    // A day with no gain over today is just "go".
    const r2 = planPurchase(phone, ctx({ cards: dated }), { cardAccountId: "hdfc", purchaseDate: "2026-11-24" });
    expect(r2.verdict).toBe("go");
    expect(planTemplateExplanation(r2)).toMatch(/^Go ahead with your hdfc-millennia on 24 Nov\./);
    ok(r2);
  });

  it("a card with no day picked uses its best-ranked day", () => {
    const r = planPurchase(phone, ctx({ cards: [card("hdfc", HDFC), card("ace", ACE, noDates)] }), { cardAccountId: "hdfc" });
    expect(r.chosen!.option.id).toBe("card:hdfc:best");
    expect(r.chosen!.option.purchaseDate).toBe("2026-11-26");
  });

  it("a day in the past counts as today", () => {
    const r = planPurchase(phone, ctx({ cards: [card("hdfc", HDFC)] }), { cardAccountId: "hdfc", purchaseDate: "2026-11-01" });
    expect(r.recommended.purchaseDate).toBe(TODAY);
  });

  it("an EMI tenure picks that EMI; its cost decides the verdict", () => {
    const withEmi = input({ price: 60000, emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199 }, { tenureMonths: 12, interestRatePa: 15 }] });
    const r = planPurchase(withEmi, ctx({ cards: [card("hdfc", HDFC, noDates)] }), { emiTenure: 12 });
    expect(r.chosen!.option.emi!.tenureMonths).toBe(12);
    expect(r.emi!.tenureMonths).toBe(12);
    expect(r.verdict).toBe("rethink_payment");
    ok(r);
  });

  it("a pick that doesn't exist throws", () => {
    expect(() => planPurchase(phone, ctx({ cards }), { cardAccountId: "nope" })).toThrow(PlanChoiceError);
    expect(() => planPurchase(phone, ctx({ cards }), { emiTenure: 9 })).toThrow(PlanChoiceError);
  });
});
