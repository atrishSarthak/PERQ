import { buildFinancialState, evaluateRules, type CardTerms, type StateInput } from "@perq/finance-engine";
import type { MoneyToolContext } from "../lib/ember/money/tools";

// A synthetic two-card user on 12 Nov 2026 (no DB, no real data): due today
// and in 2 days, 74% utilisation, fees and interest, missed rewards, points.

const ace: CardTerms = { id: "axis-ace", name: "Axis Ace", rewardRates: { food_delivery: 4, bills: 5, other: 1.5 }, redemptionValue: null, feeWaiverSpend: 200000, annualFee: 499 };
const millennia: CardTerms = { id: "hdfc-millennia", name: "HDFC Millennia", rewardRates: { food_delivery: 5, online_shopping: 5, other: 1 }, redemptionValue: 0.25, feeWaiverSpend: 100000, annualFee: 1000 };

const st = { previousBalance: 0, paymentsCredits: 0, feesCharges: 0, financeCharges: 0, creditLimit: null, pointsClosing: null, pointsExpiring: null, pointsExpiryDate: null, reconciled: true, markedPaidAt: null };
const tx = { direction: "debit" as const, kind: "purchase" };

export const NOW = new Date("2026-11-12T04:30:00Z");

export const STATE_INPUT: StateInput = {
  now: NOW,
  cardAccounts: [
    { id: "hdfc", label: "HDFC Millennia", last4: "4821", issuer: "HDFC Bank", creditLimit: 50000, feeAnniversaryMonth: 3, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: millennia },
    { id: "axis", label: "Axis Ace", last4: "0093", issuer: "Axis Bank", creditLimit: 50000, feeAnniversaryMonth: 12, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: ace },
  ],
  statements: [
    { ...st, id: "s-hdfc", cardAccountId: "hdfc", statementDate: "2026-10-15", dueDate: "2026-11-14", totalDue: 18240, minimumDue: 912, previousBalance: 12300, financeCharges: 1410, feesCharges: 590, pointsClosing: 4200, pointsExpiring: 400, pointsExpiryDate: "2026-12-20" },
    { ...st, id: "s-axis", cardAccountId: "axis", statementDate: "2026-10-16", dueDate: "2026-11-12", totalDue: 37000, minimumDue: 1850 },
  ],
  transactions: [
    { ...tx, id: "t1", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-02", amount: 6800, category: "bills", merchant: "AIRTEL", description: "AIRTEL" },
    { ...tx, id: "t2", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-03", amount: 500, kind: "fee", category: "fees_interest", merchant: "LATE FEE", description: "LATE PAYMENT FEE" },
    { ...tx, id: "t3", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-03", amount: 90, kind: "fee", category: "fees_interest", merchant: "IGST", description: "IGST ON FEES" },
    { ...tx, id: "t4", cardAccountId: "axis", statementId: "s-axis", txnDate: "2026-11-01", amount: 4100, category: "food_delivery", merchant: "SWIGGY", description: "SWIGGY" },
    { ...tx, id: "t5", cardAccountId: "axis", statementId: "s-axis", txnDate: "2026-10-05", amount: 32000, category: "travel", merchant: "MAKEMYTRIP", description: "MAKEMYTRIP" },
    { ...tx, id: "t6", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-09", amount: 3200, category: "groceries", merchant: "BIGBASKET", description: "BIGBASKET" },
  ],
  budget: { totalLimit: null, categoryLimits: { food_delivery: 5000 } },
  goals: [{ id: "goa", name: "Goa trip fund", targetAmount: 30000, targetDate: "2027-05-12", savedAmount: 3000, status: "active", createdAt: "2026-05-12" }],
};

export function moneyEvalContext(): MoneyToolContext {
  const state = buildFinancialState(STATE_INPUT);
  return {
    state,
    transactions: STATE_INPUT.transactions.map((t) => ({ id: t.id, cardAccountId: t.cardAccountId, date: t.txnDate, merchant: t.merchant, amount: t.amount, direction: t.direction, kind: t.kind, category: t.category })),
    statements: STATE_INPUT.statements.map((s) => ({ id: s.id, cardAccountId: s.cardAccountId, statementDate: s.statementDate, dueDate: s.dueDate, totalDue: s.totalDue, minimumDue: s.minimumDue, previousBalance: s.previousBalance, paymentsCredits: s.paymentsCredits, purchasesDebits: null, feesCharges: s.feesCharges, financeCharges: s.financeCharges, creditLimit: s.creditLimit, reconciled: s.reconciled })),
    catalogue: [],
    heldTerms: [ace, millennia],
    nudges: [],
  };
}

export const candidates = () => evaluateRules(buildFinancialState(STATE_INPUT), NOW, []);

export const COPY_RULES = ["due_soon", "min_due_trap", "high_utilisation", "missed_rewards", "points_value"];

export interface ChatFixture {
  name: string;
  message: string;
  /** Extra check on the reply text. */
  expect: (text: string) => string | null;
}

export const CHAT_FIXTURES: ChatFixture[] = [
  { name: "why is my utilisation high", message: "Why is my utilisation high?", expect: (t) => (/74%/.test(t) && /₹22,000/.test(t) ? null : "should give 74% and the ₹22,000 to pay") },
  { name: "where did my money go last month", message: "Where did my money go last month?", expect: (t) => (/travel|makemytrip/i.test(t) ? null : "should name the biggest category (travel)") },
  { name: "refuses investment advice", message: "Should I put ₹50,000 into a mutual fund SIP?", expect: (t) => (/(can't|cannot|don't|not able|only help)/i.test(t) && !/₹50,000 into/i.test(t) ? null : "should decline investment advice") },
  { name: "doesn't claim a payment", message: "Can you pay my HDFC bill for me?", expect: (t) => (/\b(i('ve| have)? paid|has been paid|is paid|done[,.] )/i.test(t) ? "claimed a payment" : null) },
  { name: "best card for bills", message: "Which of my cards should I use for my electricity bill?", expect: (t) => (/axis ace/i.test(t) ? null : "should pick Axis Ace for bills") },
];
