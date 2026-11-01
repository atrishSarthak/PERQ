import { describe, expect, it } from "vitest";
import { planInputSchema, planResultSchema, type PlanInput } from "@perq/shared";
import {
  decideVerdict,
  affordability,
  planCardsFromState,
  planPurchase,
  rankPaymentOptions,
  utilizationImpact,
  type PlanCard,
  type PlanCardTerms,
  type PlanContext,
} from "../src";

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

describe("utilizationImpact", () => {
  it("reports before/after, the level and what to pay to get under 30%", () => {
    expect(utilizationImpact({ balance: 10000, creditLimit: 100000, statementDay: 25 }, 50000, TODAY)).toEqual({
      before: 10,
      after: 60,
      payToStayUnder30: 30000,
      nextStatementDate: "2026-11-25",
      level: "info",
      overLimit: false,
    });
    expect(utilizationImpact({ balance: 10000, creditLimit: 100000, statementDay: 4 }, 65000, TODAY).level).toBe("warn");
    expect(utilizationImpact({ balance: 10000, creditLimit: 100000, statementDay: 4 }, 85000, TODAY).level).toBe("block");
    expect(utilizationImpact({ balance: 60000, creditLimit: 100000, statementDay: 4 }, 50000, TODAY)).toMatchObject({ overLimit: true, level: "block" });
    expect(utilizationImpact({ balance: null, creditLimit: null, statementDay: null }, 5000, TODAY).after).toBeNull();
  });
});

describe("rankPaymentOptions", () => {
  it("LOCKED: the cheapest sticker price is not the best option", () => {
    const opts = rankPaymentOptions(
      input({ price: 30000, offers: [{ type: "instant_discount", bank: "HDFC", flat: 1000, rawText: "₹1,000 off on HDFC" }] }),
      [card("hdfc", HDFC, { statementDay: null, dueDay: null }), card("sbi", SBI, { statementDay: null, dueDay: null })],
      TODAY
    );
    const hdfc = opts.find((o) => o.id === "card:hdfc:today")!;
    const sbi = opts.find((o) => o.id === "card:sbi:today")!;
    expect(hdfc.effectivePrice).toBe(29000); // cheapest price after the offer…
    expect(sbi.effectivePrice).toBe(30000);
    expect(sbi.rewards).toBe(1500);
    expect(hdfc.rewards).toBe(290);
    expect(opts[0]!.id).toBe("card:sbi:today"); // …but 5% back makes SBI cheaper overall
    expect(sbi.netCost).toBe(28500);
    expect(hdfc.netCost).toBe(28710);
    expect(sbi.savingVsUpi).toBe(1500);
    expect(opts.find((o) => o.id === "upi")!.offersSkipped[0]!.reason).toBe("Only on HDFC cards");
  });

  it("puts UPI first when both cards are near their limits", () => {
    const cards = [card("a", ACE, { creditLimit: 50000, balance: 42000 }), card("b", SBI, { creditLimit: 60000, balance: 50000 })];
    const opts = rankPaymentOptions(input({ price: 9000 }), cards, TODAY);
    expect(opts[0]!.id).toBe("upi");
    expect(opts.filter((o) => o.kind === "card_full").every((o) => o.blocked)).toBe(true);
    expect(opts.find((o) => o.id === "card:a:today")!.flags).toEqual(expect.arrayContaining(["util_over_70", "util_blocked", "over_limit"]));
  });

  it("breaks ties on fewer warnings, then more interest-free days", () => {
    const twin = { ...ACE, id: "axis-ace-2" };
    const opts = rankPaymentOptions(
      input({ price: 20000 }),
      [card("hi", ACE, { creditLimit: 40000, balance: 10000, statementDay: 4, dueDay: 24 }), card("lo", twin, { creditLimit: 400000, balance: 0, statementDay: 4, dueDay: 24 })],
      TODAY
    );
    expect(opts[0]!.cardAccountId).toBe("lo"); // same net cost, no 30% warning
    const days = rankPaymentOptions(input({ price: 2000 }), [card("short", ACE, { statementDay: 23, dueDay: 2 }), card("long", twin, { statementDay: 21, dueDay: 10 })], TODAY);
    // short: billed 23 Nov, due 2 Dec (10 days); long: billed 21 Dec, due 10 Jan (49 days)
    expect(days.find((o) => o.id === "card:long:today")!.interestFreeDays).toBe(49);
    expect(days[0]!.cardAccountId).toBe("long");
  });

  it("adds a best-day option only when it gains 10+ interest-free days in the window", () => {
    const opts = rankPaymentOptions(input({ price: 20000 }), [card("h", HDFC)], TODAY); // statement 25th
    const best = opts.find((o) => o.id === "card:h:best")!;
    expect(best.purchaseDate).toBe("2026-11-26");
    expect(best.interestFreeDays).toBe(49);
    expect(opts.find((o) => o.id === "card:h:today")!.interestFreeDays).toBe(22);
    expect(opts[0]!.id).toBe("card:h:best");
    // Need it by tomorrow: the 26th is outside the window.
    expect(rankPaymentOptions(input({ price: 20000, needBy: "2026-11-23" }), [card("h", HDFC)], TODAY).some((o) => o.id === "card:h:best")).toBe(false);
  });

  it("prices EMI options on the cards they apply to, with rewards lost", () => {
    const opts = rankPaymentOptions(
      input({ price: 24999, emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199, bankName: "Axis" }] }),
      [card("a", ACE), card("h", HDFC)],
      TODAY
    );
    const emi = opts.find((o) => o.kind === "card_emi")!;
    expect(opts.filter((o) => o.kind === "card_emi")).toHaveLength(1);
    expect(emi.id).toBe("emi:a:0");
    expect(emi.rewards).toBe(0);
    expect(emi.flags).toContain("rewards_lost_on_emi");
    expect(emi.emi!.rewardsLost).toBe(374);
    expect(emi.extraCosts).toBe(emi.emi!.gstOnInterest + emi.emi!.processingFeeWithGst);
    expect(emi.netCost).toBeGreaterThan(opts.find((o) => o.id === "card:a:today")!.netCost);
  });
});

describe("verdict rules (Locked order)", () => {
  const verdictOf = (i: PlanInput, c: PlanContext) => planPurchase(i, c);

  it("rethink_payment: a costly EMI when a cheaper option exists, ahead of wait", () => {
    const r = verdictOf(input({ price: 24999, emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199 }] }), ctx({ cards: [card("a", ACE)], leftToSpend: 5000 }));
    expect(r.verdict).toBe("rethink_payment");
    expect(r.verdictReason).toBe("costly_payment");
    expect(r.emi!.extraCostVsFullPayment).toBeGreaterThanOrEqual(500);
    expect(r.recommended.kind).not.toBe("card_emi");
  });

  it("an EMI costing under ₹500 extra doesn't trigger it", () => {
    const r = verdictOf(input({ price: 9000, item: { name: "Headphones", category: "rent" }, emiOptions: [{ tenureMonths: 3, noCost: true, interestRatePa: 12 }] }), ctx({ cards: [card("a", ACE, { statementDay: null, dueDay: null })] }));
    expect(r.verdict).toBe("go");
  });

  it("rethink_payment: every card goes over 70%", () => {
    const r = verdictOf(input({ price: 30000 }), ctx({ cards: [card("a", ACE, { creditLimit: 50000, balance: 10000 }), card("b", SBI, { creditLimit: 40000, balance: 0 })] }));
    expect(r.verdict).toBe("rethink_payment");
    expect(r.verdictReason).toBe("all_cards_high_util");
    expect(r.recommended.kind).toBe("upi");
    expect(r.headline).toBe("Pay a different way: UPI or debit");
  });

  it("wait: more than 25% over what's left, with no need-by date in 14 days", () => {
    const i = input({ price: 38000, item: { name: "Trip package", category: "travel" } });
    const r = verdictOf(i, ctx({ cards: [card("a", ACE)], leftToSpend: 28000 }));
    expect(r.verdict).toBe("wait");
    expect(r.verdictReason).toBe("over_budget");
    expect(r.headline).toBe("Better to wait");
    // Within 25%: not a wait on budget.
    expect(verdictOf(i, ctx({ cards: [card("a", ACE, { statementDay: null, dueDay: null })], leftToSpend: 31000 })).verdict).toBe("go");
    // Needed within 14 days: not a wait on budget either.
    expect(verdictOf({ ...i, needBy: "2026-11-30" }, ctx({ cards: [card("a", ACE, { statementDay: null, dueDay: null })], leftToSpend: 28000 })).verdict).toBe("go");
  });

  it("wait: a goal would slip by more than a month", () => {
    const r = verdictOf(
      input({ price: 60000, needBy: "2026-11-25" }),
      ctx({ cards: [card("a", ACE, { statementDay: null, dueDay: null })], leftToSpend: 20000, monthlyIncome: 60000, averageMonthlySpend: 40000, goals: [{ id: "g", name: "Goa trip fund", monthlyNeeded: 4500 }] })
    );
    expect(r.verdict).toBe("wait");
    expect(r.verdictReason).toBe("goal_slip");
    expect(r.affordability.goalImpacts).toEqual([{ goalId: "g", name: "Goa trip fund", monthsSlip: 2 }]); // (59,100 − 20,000) / 20,000
  });

  it("go_with_timing: the best day gains 10+ days, and wait still wins over it", () => {
    const r = verdictOf(input({ price: 59900, offers: [{ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1,500 off" }] }), ctx({ cards: [card("h", HDFC)] }));
    expect(r.verdict).toBe("go_with_timing");
    expect(r.headline).toBe("Go ahead, on 26 Nov");
    expect(r.timing).toEqual({ cardAccountId: "h", bestDate: "2026-11-26", floatToday: 22, floatBest: 49, extraDays: 27 });
    expect(r.recommended.offerDiscount).toBe(1500);
    expect(r.credit).toMatchObject({ cardAccountId: "h", before: 5, after: 34.2, payToStayUnder30: 8400 });
    expect(r.affordability).toMatchObject({ neededByDate: "2027-01-14", neededAmount: 58400, sizeLabel: "medium", basis: "budget" });
    const waited = verdictOf(input({ price: 59900 }), ctx({ cards: [card("h", HDFC)], leftToSpend: 30000 }));
    expect(waited.verdict).toBe("wait");
  });

  it("go: otherwise, and says buying today is fine when timing gains little", () => {
    const r = verdictOf(input({ price: 5000 }), ctx({ cards: [card("a", ACE, { statementDay: 23, dueDay: 12 })] }));
    // 22 Nov → billed 23 Nov, due 12 Dec (20 days); the best in 14 days is 24 Nov → 49 days. That's a gain.
    expect(r.verdict).toBe("go_with_timing");
    const flat = verdictOf(input({ price: 5000 }), ctx({ cards: [card("a", ACE, { statementDay: 21, dueDay: 10 })] }));
    expect(flat.verdict).toBe("go"); // bought just after the statement already: 49 days today
    expect(flat.timing).toMatchObject({ bestDate: TODAY, extraDays: 0 });
    expect(flat.headline).toBe("Go ahead, with your axis-ace");
  });
});

describe("missing data is named", () => {
  it("no cards: compares UPI only and says so", () => {
    const r = planPurchase(input({ price: 5000 }), ctx({ cards: [], hasStatements: false }));
    expect(r.options.map((o) => o.id)).toEqual(["upi"]);
    expect(r.missingData.map((m) => m.code)).toContain("no_cards");
    expect(planResultSchema.safeParse(r).success).toBe(true);
  });

  it("no statements: a quiz-held card still earns rewards, without dates or limits", () => {
    const cards = planCardsFromState({ cards: [] }, new Map([["sbi-cashback", SBI]]), ["sbi-cashback"]);
    expect(cards[0]).toMatchObject({ cardAccountId: null, statementDay: null, creditLimit: null });
    const r = planPurchase(input({ price: 10000 }), ctx({ cards, hasStatements: false }));
    expect(r.recommended.id).toBe("card:cat-sbi-cashback:today");
    expect(r.recommended.rewards).toBe(500);
    expect(r.recommended.interestFreeDays).toBeNull();
    expect(r.timing).toBeUndefined();
    expect(r.missingData.map((m) => m.code)).toContain("no_statements");
  });

  it("no budget: falls back to 30% of income, then to nothing", () => {
    const r = planPurchase(input({ price: 10000 }), ctx({ leftToSpend: null, monthlyIncome: 100000, monthSpend: 12000 }));
    expect(r.affordability).toMatchObject({ basis: "income_estimate", leftThisMonth: 18000, afterPurchase: 8000 });
    expect(r.missingData.map((m) => m.code)).toContain("no_budget");
    const none = planPurchase(input({ price: 10000 }), ctx({ leftToSpend: null, monthlyIncome: null }));
    expect(none.affordability).toMatchObject({ basis: "none", leftThisMonth: null, sizeLabel: "unknown" });
    expect(none.missingData.map((m) => m.code)).toEqual(expect.arrayContaining(["no_budget", "no_income"]));
    expect(none.verdict).toBe("go");
  });

  it("names unlinked cards, missing dates and limits, and unreconciled statements", () => {
    const r = planPurchase(input({ price: 1000 }), ctx({ cards: [card("x", null, { statementDay: null, creditLimit: null, hasUnreconciled: true })] }));
    expect(r.missingData.map((m) => m.code)).toEqual(expect.arrayContaining(["no_statement_dates", "no_credit_limit", "no_card_terms", "unreconciled"]));
  });
});

describe("planCardsFromState", () => {
  it("uses 0 once the statement is marked paid, and a newer manual balance otherwise", () => {
    const base = {
      cardAccountId: "a", label: "ACE", issuer: "Axis Bank", catalogueCardId: "axis-ace", creditLimit: 100000, hasUnreconciled: false,
      statementDay: 4, dueDay: 24, monthSpendByRewardCategory: { online_shopping: 1000 },
    };
    const [paid] = planCardsFromState({ cards: [{ ...base, balanceForUtilisation: 22120, balanceSource: "statement", isPaidMarked: true } as never] }, new Map([["axis-ace", ACE]]));
    expect(paid!.balance).toBe(0);
    expect(paid!.terms!.id).toBe("axis-ace");
    const [override] = planCardsFromState({ cards: [{ ...base, balanceForUtilisation: 37000, balanceSource: "override", isPaidMarked: true } as never] }, new Map());
    expect(override!.balance).toBe(37000);
    expect(override!.terms).toBeNull();
  });
});

describe("every plan validates against the shared schema", () => {
  it("parses", () => {
    const r = planPurchase(
      input({ price: 24999, emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199 }], offers: [{ type: "cashback", percent: 5, maxDiscount: 1000, rawText: "5% back" }] }),
      ctx({ cards: [card("a", ACE), card("h", HDFC)], goals: [{ id: "g", name: "Goa", monthlyNeeded: 4500 }] })
    );
    expect(planResultSchema.parse(r)).toEqual(r);
    // affordability() and decideVerdict() are callable on their own (extension reuse).
    expect(decideVerdict(input({ price: 100 }), r.options, affordability(input({ price: 100 }), r.options[0]!, ctx()), TODAY).verdict).toBeDefined();
  });
});

describe("ranking tiers and utilisation dates", () => {
  it("doesn't rank a slightly cheaper card first when it pushes utilisation over 70%", () => {
    const opts = rankPaymentOptions(
      input({ price: 5000 }),
      [card("hot", SBI, { creditLimit: 50000, balance: 37000, statementDay: null, dueDay: null }), card("cool", ACE, { creditLimit: 100000, balance: 22000, statementDay: null, dueDay: null })],
      TODAY
    );
    expect(opts.find((o) => o.cardAccountId === "hot")!.netCost).toBeLessThan(opts.find((o) => o.cardAccountId === "cool")!.netCost);
    expect(opts[0]!.cardAccountId).toBe("cool");
  });
  it("keeps the over-70% card first when it saves ₹500 or more", () => {
    const opts = rankPaymentOptions(
      input({ price: 59900, offers: [{ type: "instant_discount", bank: "Axis", flat: 1500, rawText: "₹1,500 off on Axis" }] }),
      [card("ace", ACE, { creditLimit: 100000, balance: 22120, statementDay: null, dueDay: null }), card("hdfc", HDFC, { creditLimit: null, balance: null, statementDay: null, dueDay: null })],
      TODAY
    );
    expect(opts[0]!.cardAccountId).toBe("ace");
    expect(opts[0]!.flags).toContain("util_over_70");
  });
  it("tells you to pay down before the statement the purchase lands on", () => {
    const r = planPurchase(input({ price: 59900 }), ctx({ cards: [card("h", HDFC, { creditLimit: 100000 })] }));
    expect(r.recommended.purchaseDate).toBe("2026-11-26");
    expect(r.credit!.nextStatementDate).toBe("2026-12-25");
  });
});
