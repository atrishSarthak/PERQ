import { describe, expect, it } from "vitest";
import { planInputSchema, planResultSchema, type PlanInput } from "@perq/shared";
import {
  isPlanExpired,
  planTemplateExplanation,
  validatePlanExplanation,
  planBuyWindowCandidates,
  planIdFromDedupeKey,
  planPurchase,
  simulateUpcoming,
  validateNudgeCopy,
  type PlanCard,
  type PlanCardTerms,
  type PlanContext,
} from "../src";

// Step 3 §8: the plan_buy_window reminder, the savings-goal proposal on a
// wait, and expiry.

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


const big = () => [card("hdfc", HDFC, { creditLimit: 1000000 })];
const at9 = (day: string) => new Date(`${day}T09:00:00+05:30`);

describe("goal proposal", () => {
  it("is offered on a wait: the price, dated by what's spare after other goals", () => {
    // ₹1,50,000 income − ₹40,000 average spend = ₹1,10,000 saved; a goal needs ₹10,000 → ₹1,00,000 spare.
    const r = planPurchase(input({ price: 250000 }), ctx({ cards: big(), leftToSpend: 20000, goals: [{ id: "g", name: "Trip", monthlyNeeded: 10000 }] }));
    expect(r.verdict).toBe("wait");
    expect(r.goalProposal).toEqual({ name: "Phone", target: 250000, targetDate: "2027-02-22", monthlySaving: 83334 });
    planResultSchema.parse(r);
  });

  it("has no date when the saving pace is unknown", () => {
    const r = planPurchase(input({ price: 250000 }), ctx({ cards: big(), leftToSpend: 20000, monthlyIncome: null }));
    expect(r.goalProposal).toMatchObject({ target: 250000, targetDate: null, monthlySaving: null });
  });

  it("isn't offered on a go", () => {
    expect(planPurchase(input({ price: 2000 }), ctx({ cards: [card("hdfc", HDFC)] })).goalProposal).toBeUndefined();
  });
});

describe("plan_buy_window", () => {
  const go = planPurchase(input({ price: 30000 }), ctx({ cards: [card("hdfc", HDFC)] }));
  const wait = planPurchase(input({ price: 250000 }), ctx({ cards: big(), leftToSpend: 20000 }));
  const reminder = (over: Partial<Parameters<typeof planBuyWindowCandidates>[0][number]> = {}) => ({
    planId: "p1",
    itemName: "Phone",
    remindAt: "2026-11-26",
    previousVerdict: go.verdict,
    previousHeadline: go.headline,
    result: go,
    ...over,
  });

  it("fires from the reminder day for 3 days, at priority 80, keyed by plan and day", () => {
    expect(planBuyWindowCandidates([reminder()], at9("2026-11-25"))).toEqual([]);
    const [c] = planBuyWindowCandidates([reminder()], at9("2026-11-26"));
    expect(c).toMatchObject({ ruleId: "plan_buy_window", priority: 80, dedupeKey: "plan_buy_window:p1:2026-11-26", cardAccountId: "hdfc" });
    expect(planIdFromDedupeKey(c!.dedupeKey)).toBe("p1");
    expect(planBuyWindowCandidates([reminder()], at9("2026-11-28"))).toHaveLength(1);
    expect(planBuyWindowCandidates([reminder()], at9("2026-11-29"))).toEqual([]);
  });

  it("words an unchanged plan from the fresh result, and the copy passes the nudge checks", () => {
    const [c] = planBuyWindowCandidates([reminder()], at9("2026-11-26"));
    expect(c!.templateBody).toContain(go.recommended.label);
    expect(c!.payload.changed).toBe(false);
    expect(validateNudgeCopy({ title: c!.templateTitle, body: c!.templateBody }, c!.payload, { title: c!.templateTitle, body: c!.templateBody })).toEqual({ ok: true });
  });

  it("says so when the verdict changed", () => {
    const [c] = planBuyWindowCandidates([reminder({ result: wait })], at9("2026-11-26"));
    expect(c!.payload.changed).toBe(true);
    expect(c!.templateTitle).toBe("Your Phone plan changed");
    expect(c!.templateBody).toMatch(/the answer changed: better to wait, not go ahead/);
  });

  it("joins the Expo Go simulation on its day", () => {
    const stateInput = { now: at9("2026-11-24"), cardAccounts: [], statements: [], transactions: [], budget: null, goals: [] };
    const up = simulateUpcoming(stateInput, [], [], (when) => planBuyWindowCandidates([reminder()], when));
    expect(up.find((u) => u.ruleId === "plan_buy_window")?.at).toBe(at9("2026-11-26").toISOString());
  });
});

describe("isPlanExpired", () => {
  it("30 days after need-by, else 45 after creation; only open plans", () => {
    const p = { status: "planned", needByDate: "2026-11-01", createdDay: "2026-10-01" };
    expect(isPlanExpired(p, "2026-12-01")).toBe(false);
    expect(isPlanExpired(p, "2026-12-02")).toBe(true);
    expect(isPlanExpired({ ...p, needByDate: null }, "2026-11-15")).toBe(false);
    expect(isPlanExpired({ ...p, needByDate: null }, "2026-11-16")).toBe(true);
    expect(isPlanExpired({ ...p, status: "bought" }, "2027-06-01")).toBe(false);
  });
});

describe("explanation reasons", () => {
  it("a wait must say why (the budget), and isn't tied to the card's statement day", () => {
    const r = planPurchase(input({ price: 250000 }), ctx({ cards: big(), leftToSpend: 20000 }));
    expect(r.verdictReason).toBe("over_budget");
    expect(validatePlanExplanation(planTemplateExplanation(r), r)).toEqual({ ok: true });
    const day = r.recommended.purchaseDate.slice(8).replace(/^0/, "");
    expect(validatePlanExplanation(`Better to wait until ${day} Nov to buy with your hdfc-millennia. It costs ${"₹2,47,500"}.`, r).ok).toBe(false);
    expect(validatePlanExplanation("Better to wait. Your hdfc-millennia gives the most rewards here.", r)).toEqual({ ok: false, reason: "reason missing: budget" });
  });
});
