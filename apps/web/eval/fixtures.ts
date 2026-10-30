import type { QuizAnswersV2 } from "@perq/shared";

// Ember eval fixtures (handoff §1.8): 10 cases run against the real
// 40-card catalogue. `expectedTopCardId` pins the deterministic ranking
// (checked offline in test/eval/fixtures.test.ts); the live eval then checks
// Ember's prose against the tool outputs.

const spend = (s: Partial<QuizAnswersV2["monthlySpend"]>): QuizAnswersV2["monthlySpend"] => ({
  food_delivery: "0",
  online_shopping: "0",
  groceries: "0",
  dining: "0",
  fuel: "0",
  bills: "0",
  upi: "0",
  ...s,
});

const base: QuizAnswersV2 = {
  schemaVersion: 2,
  cardsHeld: [],
  occupation: "salaried",
  monthlyIncome: "50k_1l",
  monthlySpend: spend({ food_delivery: "1k_3k", online_shopping: "1k_3k", groceries: "1k_3k", dining: "1k_3k", bills: "1k_3k" }),
  travelPerYear: "1_2",
  feeTolerance: "upto_1000",
  priorities: [],
  openToSecured: null,
};

export interface EvalFixture {
  name: string;
  answers: QuizAnswersV2;
  expectedTopCardId: string;
  /** Set for "why not X?" chat fixtures: the card the user asks about. */
  whyNotCardId?: string;
}

export const FIXTURES: EvalFixture[] = [
  {
    name: "food-delivery heavy, modest fee",
    answers: { ...base, monthlySpend: spend({ food_delivery: "6k_plus", online_shopping: "1k_3k", groceries: "1k_3k" }) },
    // Live+ pays the same 10% on delivery, plus 10% on groceries.
    expectedTopCardId: "hsbc-live-plus",
  },
  {
    name: "everyday spender, any fee",
    answers: {
      ...base,
      feeTolerance: "any",
      monthlySpend: spend({ food_delivery: "3k_6k", online_shopping: "3k_6k", groceries: "3k_6k", dining: "1k_3k", bills: "1k_3k", upi: "1k_3k" }),
    },
    expectedTopCardId: "hsbc-live-plus",
  },
  {
    name: "student, ₹0 fee, open to FD",
    answers: {
      ...base,
      occupation: "student",
      monthlyIncome: "below_25k",
      feeTolerance: "zero",
      openToSecured: true,
      monthlySpend: spend({ food_delivery: "1k_3k", online_shopping: "lt_1k", upi: "1k_3k" }),
      travelPerYear: "never",
    },
    expectedTopCardId: "icici-amazon-pay",
  },
  {
    name: "heavy UPI user, ₹0 fee",
    answers: { ...base, feeTolerance: "zero", monthlySpend: spend({ upi: "6k_plus", online_shopping: "lt_1k" }), travelPerYear: "never" },
    expectedTopCardId: "kiwi-yes-rupay",
  },
  {
    name: "fuel heavy commuter",
    answers: {
      ...base,
      feeTolerance: "upto_5000",
      monthlySpend: spend({ fuel: "6k_plus", dining: "lt_1k" }),
    },
    expectedTopCardId: "sbi-bpcl-octane",
  },
  {
    name: "online shopper on a ₹0 budget",
    answers: { ...base, feeTolerance: "zero", monthlySpend: spend({ online_shopping: "6k_plus", food_delivery: "1k_3k" }) },
    expectedTopCardId: "icici-amazon-pay",
  },
  {
    name: "already holds the best card",
    answers: {
      ...base,
      cardsHeld: ["hsbc-live-plus"],
      monthlySpend: spend({ food_delivery: "6k_plus", online_shopping: "1k_3k", groceries: "1k_3k" }),
    },
    expectedTopCardId: "hsbc-live-plus",
  },
  {
    name: "why not Amazon Pay (everyday spender)",
    answers: {
      ...base,
      feeTolerance: "any",
      monthlySpend: spend({ food_delivery: "3k_6k", online_shopping: "3k_6k", groceries: "3k_6k", dining: "1k_3k", bills: "1k_3k", upi: "1k_3k" }),
    },
    expectedTopCardId: "hsbc-live-plus",
    whyNotCardId: "icici-amazon-pay",
  },
  {
    name: "why not Swiggy HDFC when fees aren't OK",
    answers: { ...base, feeTolerance: "zero", monthlySpend: spend({ food_delivery: "6k_plus", online_shopping: "1k_3k" }) },
    expectedTopCardId: "icici-amazon-pay",
    whyNotCardId: "hdfc-swiggy",
  },
  {
    name: "why not SBI Cashback for a food-heavy user",
    answers: { ...base, monthlySpend: spend({ food_delivery: "6k_plus", online_shopping: "1k_3k", groceries: "1k_3k" }) },
    expectedTopCardId: "hsbc-live-plus",
    whyNotCardId: "sbi-cashback",
  },
];
