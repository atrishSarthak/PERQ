import { planPurchase, type PlanCard, type PlanCardTerms, type PlanContext } from "@perq/finance-engine";
import { planInputSchema, type PlanResult, type Verdict } from "@perq/shared";

// Purchase planner eval fixtures (Step 3 §11), synthetic, no DB: four plans,
// one per verdict, for Ember's explanation; one chat message without a price;
// and the five synthetic product screenshots in fixtures/plans/.

const TODAY = "2026-11-22";

const terms = (id: string, name: string, issuer: string, rate: number): PlanCardTerms => ({
  id, name, issuer, networks: ["Visa"], rewardRates: { online_shopping: rate, travel: rate, other: rate }, redemptionValue: null,
  feeWaiverSpend: null, annualFee: 0, rewardCaps: {}, capGroups: [], emiRewards: false,
});
const card = (id: string, label: string, issuer: string, rate: number, over: Partial<PlanCard> = {}): PlanCard => ({
  cardAccountId: id, label, issuer, terms: terms(id, label, issuer, rate), statementDay: 21, dueDay: 10, creditLimit: 300000, balance: 20000,
  hasUnreconciled: false, monthSpendByCategory: {}, ...over,
});
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  today: TODAY, cards: [card("axis", "Axis ACE", "Axis Bank", 1.5)], leftToSpend: 30000, monthBudget: 40000, monthSpend: 10000,
  goals: [], monthlyIncome: 100000, averageMonthlySpend: 45000, hasStatements: true, ...over,
});
const plan = (raw: unknown, c: PlanContext) => {
  const input = planInputSchema.parse(raw);
  return { input, result: planPurchase(input, c) };
};

export interface ExplainFixture {
  name: string;
  expect: Verdict;
  input: ReturnType<typeof planInputSchema.parse>;
  result: PlanResult;
}

export const EXPLAIN_FIXTURES: ExplainFixture[] = [
  {
    name: "headphones within budget, card already at its best day",
    expect: "go",
    ...plan({ item: { name: "Headphones", category: "online_shopping" }, price: 8499, merchant: "Amazon" }, ctx()),
  },
  {
    name: "phone with an HDFC offer, statement closes in 3 days",
    expect: "go_with_timing",
    ...plan(
      {
        item: { name: "Phone", category: "online_shopping" }, price: 59900, merchant: "Flipkart", needBy: "2026-12-05",
        offers: [{ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1,500 off on HDFC Bank credit cards" }],
      },
      ctx({ cards: [card("axis", "Axis ACE", "Axis Bank", 1.5), card("hdfc", "Regalia Gold", "HDFC Bank", 0.5, { statementDay: 25, dueDay: 14 })], monthlyIncome: 150000 })
    ),
  },
  {
    name: "trip package over what's left this month",
    expect: "wait",
    ...plan({ item: { name: "Trip package", category: "travel" }, price: 38000, merchant: "MakeMyTrip" }, ctx({ leftToSpend: 12000, monthBudget: 28000 })),
  },
  {
    name: "laptop on no-cost EMI with a ₹199 fee",
    expect: "rethink_payment",
    ...plan(
      { item: { name: "Laptop", category: "online_shopping" }, price: 24999, merchant: "Amazon", emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199, bankName: "Axis Bank" }] },
      ctx()
    ),
  },
];

/** A purchase question with no price: Ember must ask for it, not guess. */
export const NO_PRICE_MESSAGE = "Should I buy the new Sony WH-1000XM6 headphones from Croma? I want them before my trip.";
export const NO_PRICE_CTX = ctx();

export const SCREENSHOTS = ["phone", "laptop", "headphones", "fridge", "watch"] as const;
