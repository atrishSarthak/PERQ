import type { Card, UserProfile } from "@perq/scoring-engine";

export interface EvalFixture {
  name: string;
  profile: UserProfile;
  cards: (Card & { name: string })[];
  // The card id the deterministic scorer should rank #1 for this fixture
  // (asserted separately from the LLM call — grounds what "correct" means
  // for this fixture without relying on the model's own judgment).
  expectedTopCardId: string;
  // A real number (as it would appear in the explanation) the grounding
  // check looks for — a spot check, not exhaustive fact-checking.
  expectedGroundedNumber: string;
  // If set, the explanation should mention this category — used for
  // fixtures designed to require a surfaced trade-off (PRD §9.1).
  expectedTradeoffMention?: string;
}

const zeroRates = {
  dining: 0,
  travel: 0,
  hotels: 0,
  fuel: 0,
  groceries: 0,
  ecommerce: 0,
  utilities: 0,
  general: 0,
};

export const FIXTURES: EvalFixture[] = [
  {
    name: "heavy-dining-spend",
    profile: {
      categorySpend: { ...zeroRates, dining: 9000 },
      annualIncome: 900000,
      feeTolerant: true,
      priorityCategories: ["dining"],
    },
    cards: [
      {
        id: "eval-dining-card",
        name: "Eval Dining Card",
        annualFee: 500,
        rewardRates: { ...zeroRates, dining: 0.05 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
      {
        id: "eval-generic-card",
        name: "Eval Generic Card",
        annualFee: 0,
        rewardRates: { ...zeroRates, general: 0.01 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
    ],
    expectedTopCardId: "eval-dining-card",
    expectedGroundedNumber: "5400", // 0.05 * 9000 * 12
  },
  {
    name: "heavy-travel-spend-high-income",
    profile: {
      categorySpend: { ...zeroRates, travel: 15000 },
      annualIncome: 1500000,
      feeTolerant: true,
      priorityCategories: ["travel"],
    },
    cards: [
      {
        id: "eval-travel-card",
        name: "Eval Travel Card",
        annualFee: 5000,
        rewardRates: { ...zeroRates, travel: 0.06 },
        milestoneBenefits: [{ spendThreshold: 100000, bonusValue: 3000 }],
        minIncomeEligibility: 1000000,
      },
      {
        id: "eval-zero-fee-card",
        name: "Eval Zero Fee Card",
        annualFee: 0,
        rewardRates: { ...zeroRates, travel: 0.01 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
    ],
    expectedTopCardId: "eval-travel-card",
    expectedGroundedNumber: "10800", // 0.06 * 15000 * 12
  },
  {
    name: "tradeoff-priority-not-served",
    profile: {
      categorySpend: { ...zeroRates, dining: 9000, travel: 1000 },
      annualIncome: 900000,
      feeTolerant: true,
      priorityCategories: ["travel"], // priority stated, but dining card will win numerically
    },
    cards: [
      {
        id: "eval-dining-card-2",
        name: "Eval Dining Card Two",
        annualFee: 500,
        rewardRates: { ...zeroRates, dining: 0.05, travel: 0 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
      {
        id: "eval-weak-travel-card",
        name: "Eval Weak Travel Card",
        annualFee: 2000,
        rewardRates: { ...zeroRates, dining: 0, travel: 0.02 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
    ],
    expectedTopCardId: "eval-dining-card-2",
    expectedGroundedNumber: "5400",
    expectedTradeoffMention: "travel",
  },
  {
    name: "fee-sensitive-profile",
    profile: {
      categorySpend: { ...zeroRates, groceries: 3000 },
      annualIncome: 400000,
      feeTolerant: false,
      priorityCategories: ["general"],
    },
    cards: [
      {
        id: "eval-highfee-card",
        name: "Eval High Fee Card",
        annualFee: 3000,
        rewardRates: { ...zeroRates, groceries: 0.03 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
      {
        id: "eval-zerofee-grocery-card",
        name: "Eval Zero Fee Grocery Card",
        annualFee: 0,
        rewardRates: { ...zeroRates, groceries: 0.015 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
    ],
    expectedTopCardId: "eval-zerofee-grocery-card",
    expectedGroundedNumber: "540", // 0.015 * 3000 * 12
  },
  {
    name: "milestone-benefit-tips-the-balance",
    profile: {
      categorySpend: { ...zeroRates, ecommerce: 8000 },
      annualIncome: 700000,
      feeTolerant: true,
      priorityCategories: ["ecommerce"],
    },
    cards: [
      {
        id: "eval-milestone-card",
        name: "Eval Milestone Card",
        annualFee: 1000,
        rewardRates: { ...zeroRates, ecommerce: 0.02 },
        milestoneBenefits: [{ spendThreshold: 90000, bonusValue: 4000 }],
        minIncomeEligibility: null,
      },
      {
        id: "eval-plain-card",
        name: "Eval Plain Card",
        annualFee: 0,
        rewardRates: { ...zeroRates, ecommerce: 0.025 },
        milestoneBenefits: [],
        minIncomeEligibility: null,
      },
    ],
    expectedTopCardId: "eval-milestone-card",
    expectedGroundedNumber: "4000",
  },
];
