import { z } from "zod";
import { PERMISSION, type EmberTool } from "@perq/ai";
import {
  amountToReachUtilisation,
  bestCardFor,
  utilisationAfter,
  type CardTerms,
  type FinancialState,
  type NudgePayload,
} from "@perq/finance-engine";
import { TXN_CATEGORIES, TXN_CATEGORY_LABELS, type CatalogCard, type NudgeWhy } from "@perq/shared";

// Ember's Money Manager tools (handoff §8). Levels 1 (read/compute) and 3
// (prepare a proposal the user confirms in the UI; nothing is saved here).
// Every rupee figure comes from finance-engine via the financial state.
// Transactions are exposed by normalised merchant, never the raw line.

export interface MoneyTxn {
  id: string;
  cardAccountId: string;
  date: string;
  merchant: string;
  amount: number;
  direction: "debit" | "credit";
  kind: string;
  category: string;
}
export interface MoneyStatement {
  id: string;
  cardAccountId: string;
  statementDate: string;
  dueDate: string | null;
  totalDue: number | null;
  minimumDue: number | null;
  previousBalance: number | null;
  paymentsCredits: number | null;
  purchasesDebits: number | null;
  feesCharges: number | null;
  financeCharges: number | null;
  creditLimit: number | null;
  reconciled: boolean;
}
export interface MoneyNudge {
  id: string;
  ruleId: string;
  title: string;
  body: string;
  payload: NudgePayload;
  why: NudgeWhy;
}

export interface MoneyToolContext {
  state: FinancialState;
  transactions: MoneyTxn[];
  statements: MoneyStatement[];
  catalogue: CatalogCard[];
  heldTerms: CardTerms[];
  nudges: MoneyNudge[];
}

export type MoneyProposal =
  | { kind: "budget"; total: number | null; categories: Record<string, number> }
  | { kind: "goal"; name: string; target: number; date: string | null };

const MAX_TXNS = 100;
const categoryEnum = z.enum(TXN_CATEGORIES);
const label = (c: string) => TXN_CATEGORY_LABELS[c as keyof typeof TXN_CATEGORY_LABELS] ?? c;

export function createMoneyTools(ctx: MoneyToolContext, onProposal?: (p: MoneyProposal) => void) {
  // One proposal per turn: the app shows one Confirm card, and a model that
  // re-proposes with different numbers would contradict itself.
  let proposed: MoneyProposal | null = null;
  const alreadyProposed = () =>
    proposed ? { error: "You already made a proposal this turn. Describe that one to the user instead.", yourProposal: proposed } : null;
  const card = (id: string) => ctx.state.cards.find((c) => c.cardAccountId === id);
  const cardName = (id: string) => card(id)?.label ?? "card";

  const getFinancialState: EmberTool<Record<string, never>, unknown> = {
    name: "getFinancialState",
    description:
      "The user's money picture from their uploaded statements: each card's due date, total and minimum due, utilisation, fee waiver progress, points, fees last cycle; this month's spend by category vs budget; missed rewards last cycle; goals. dataThrough is the latest statement date.",
    input: z.object({}).strict(),
    permission: PERMISSION.OBSERVE,
    narration: "Ember checked your cards and statements",
    handler: async () => ({
      asOf: ctx.state.asOf,
      dataThrough: ctx.state.dataThrough,
      cards: ctx.state.cards.map((c) => ({
        cardAccountId: c.cardAccountId,
        card: c.label,
        last4: c.last4,
        statementDate: c.latestStatement?.date ?? null,
        dueDate: c.latestStatement?.dueDate ?? null,
        totalDue: c.latestStatement?.totalDue ?? null,
        minimumDue: c.latestStatement?.minimumDue ?? null,
        interestLastCycle: c.latestStatement?.financeCharges ?? null,
        daysToDue: c.daysToDue,
        markedPaid: c.isPaidMarked,
        creditLimit: c.creditLimit,
        balance: c.balanceForUtilisation,
        utilisationPct: c.utilisationPct,
        daysToStatement: c.daysToStatement,
        points: c.points,
        feeWaiver: c.feeWaiver,
        feesLastCycle: c.feesLastCycle.total,
        totalsAddUp: c.latestStatement?.reconciled ?? null,
      })),
      totals: ctx.state.totals,
      thisMonth: {
        month: ctx.state.month.key,
        totalSpend: ctx.state.month.totalSpend,
        spendByCategory: Object.fromEntries(Object.entries(ctx.state.month.spendByCategory).map(([k, v]) => [label(k), v])),
        budget: ctx.state.month.budget,
        leftToSpend: ctx.state.month.leftToSpend,
        daysLeft: ctx.state.month.daysLeft,
        coverage: ctx.state.month.coverage,
      },
      missedRewardsLastCycle: {
        total: ctx.state.missedRewardsLastCycle.total,
        top: ctx.state.missedRewardsLastCycle.items.slice(0, 8).map((m) => ({
          date: m.date, merchant: m.merchant, category: label(m.category), amount: m.amount, usedCard: m.usedCard, betterCard: m.betterCard, extra: m.extra,
        })),
      },
      goals: ctx.state.goals,
    }),
  };

  const getTransactions: EmberTool<
    { cardAccountId?: string; category?: string; from?: string; to?: string; minAmount?: number; limit?: number },
    unknown
  > = {
    name: "getTransactions",
    description: `Transactions from uploaded statements, newest first, filtered. Dates are YYYY-MM-DD. Categories: ${TXN_CATEGORIES.join(", ")}. Returns at most ${MAX_TXNS} rows plus the matching count and debit total.`,
    input: z.object({
      cardAccountId: z.string().optional(),
      category: categoryEnum.optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      minAmount: z.number().nonnegative().optional(),
      limit: z.number().int().min(1).max(MAX_TXNS).optional(),
    }),
    permission: PERMISSION.OBSERVE,
    narration: (_i, o) => `Ember looked through ${(o as { count: number }).count} transactions`,
    handler: async (i) => {
      const rows = ctx.transactions
        .filter((t) => (!i.cardAccountId || t.cardAccountId === i.cardAccountId) && (!i.category || t.category === i.category))
        .filter((t) => (!i.from || t.date >= i.from) && (!i.to || t.date <= i.to) && (!i.minAmount || t.amount >= i.minAmount))
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        count: rows.length,
        debitTotal: rows.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0),
        rows: rows.slice(0, i.limit ?? 30).map((t) => ({
          date: t.date, merchant: t.merchant, amount: t.amount, direction: t.direction, category: label(t.category), card: cardName(t.cardAccountId),
        })),
      };
    },
  };

  const getStatement: EmberTool<{ statementId: string }, unknown> = {
    name: "getStatement",
    description: "The summary block of one statement (ids from getFinancialState's cards are not statement ids; use listStatements first if needed).",
    input: z.object({ statementId: z.string() }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember opened a statement",
    handler: async ({ statementId }) => {
      const s = ctx.statements.find((x) => x.id === statementId);
      return s ? { ...s, card: cardName(s.cardAccountId), totalsAddUp: s.reconciled } : { error: "No statement with that id." };
    },
  };

  const listStatements: EmberTool<{ cardAccountId?: string }, unknown> = {
    name: "listStatements",
    description: "Uploaded statements (id, card, date, total due), newest first.",
    input: z.object({ cardAccountId: z.string().optional() }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ cardAccountId }) =>
      ctx.statements
        .filter((s) => !cardAccountId || s.cardAccountId === cardAccountId)
        .sort((a, b) => b.statementDate.localeCompare(a.statementDate))
        .map((s) => ({ statementId: s.id, card: cardName(s.cardAccountId), statementDate: s.statementDate, totalDue: s.totalDue })),
  };

  const getCardRules: EmberTool<{ cardId: string }, unknown> = {
    name: "getCardRules",
    description: "A catalogue card's reward rates (% back per category), fees, fee waiver spend and point value.",
    input: z.object({ cardId: z.string() }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ cardId }) => {
      const c = ctx.catalogue.find((x) => x.id === cardId);
      if (!c) return { error: "Not in the catalogue." };
      return {
        cardId: c.id, name: c.name, issuer: c.issuer, rewardRatesPct: c.rewardRates, annualFee: c.annualFee, joiningFee: c.joiningFee,
        feeWaiverSpend: c.feeWaiverSpend, pointValueRupees: c.redemptionValue, termsChecked: c.sourceUpdatedAt,
      };
    },
  };

  const bestCard: EmberTool<{ category: string; amount: number }, unknown> = {
    name: "bestCardFor",
    description: "Which of the user's own cards earns most for a spend in a category, and the reward in ₹.",
    input: z.object({ category: categoryEnum, amount: z.number().positive() }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember compared your cards for that spend",
    handler: async ({ category, amount }) => {
      const best = bestCardFor(category, amount, ctx.heldTerms);
      return best ? { forAmount: amount, category: label(category), ...best } : { error: "None of the user's cards are linked to catalogue terms yet." };
    },
  };

  const utilizationImpact: EmberTool<{ cardAccountId: string; amount: number }, unknown> = {
    name: "utilizationImpact",
    description: "Utilisation % on a card after spending (positive amount) or paying (negative amount).",
    input: z.object({ cardAccountId: z.string(), amount: z.number() }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ cardAccountId, amount }) => {
      const c = card(cardAccountId);
      if (!c?.creditLimit || c.balanceForUtilisation === null) return { error: "No limit or balance for that card yet." };
      return { card: c.label, nowPct: c.utilisationPct, afterPct: utilisationAfter(c.balanceForUtilisation, c.creditLimit, amount), amount };
    },
  };

  const toUtilisation: EmberTool<{ cardAccountId: string; targetPct: number }, unknown> = {
    name: "amountToReachUtilisation",
    description: "How much to pay on a card to bring utilisation down to a target %.",
    input: z.object({ cardAccountId: z.string(), targetPct: z.number().min(0).max(100) }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ cardAccountId, targetPct }) => {
      const c = card(cardAccountId);
      if (!c?.creditLimit || c.balanceForUtilisation === null) return { error: "No limit or balance for that card yet." };
      return { card: c.label, nowPct: c.utilisationPct, targetPct, payAmount: amountToReachUtilisation(c.balanceForUtilisation, c.creditLimit, targetPct) };
    },
  };

  const feeWaiverStatus: EmberTool<{ cardAccountId: string }, unknown> = {
    name: "feeWaiverStatus",
    description: "Annual fee waiver progress on one card: spend so far this card year, amount remaining, months left, on pace or not.",
    input: z.object({ cardAccountId: z.string() }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ cardAccountId }) => {
      const c = card(cardAccountId);
      return c?.feeWaiver ? { card: c.label, ...c.feeWaiver } : { error: "That card has no fee waiver, or isn't linked to catalogue terms." };
    },
  };

  const explainNudge: EmberTool<{ nudgeId: string }, unknown> = {
    name: "explainNudge",
    description: "Why a nudge was sent: the rule, its exact numbers and the data date.",
    input: z.object({ nudgeId: z.string() }),
    permission: PERMISSION.OBSERVE,
    handler: async ({ nudgeId }) => {
      const n = ctx.nudges.find((x) => x.id === nudgeId);
      return n ? { title: n.title, body: n.body, ...n.why, numbers: n.payload } : { error: "No nudge with that id." };
    },
  };

  const proposeBudget: EmberTool<{ total?: number; categories: { category: string; amount: number }[] }, unknown> = {
    name: "proposeBudget",
    description:
      "Prepare a monthly budget for the user to confirm (nothing is saved; the app shows a Confirm button). categories lists a ₹ per month limit per category id.",
    input: z.object({
      total: z.number().int().positive().optional(),
      categories: z.array(z.object({ category: categoryEnum, amount: z.number().int().positive() })).max(TXN_CATEGORIES.length),
    }),
    permission: PERMISSION.PREPARE,
    narration: "Ember drafted a budget for you to confirm",
    handler: async ({ total, categories: list }) => {
      const again = alreadyProposed();
      if (again) return again;
      const categories = Object.fromEntries(list.map((c) => [c.category, c.amount]));
      const p: MoneyProposal = { kind: "budget", total: total ?? null, categories };
      proposed = p;
      onProposal?.(p);
      return { proposed: true, needsYourConfirmation: true, total: p.total, categories };
    },
  };

  const proposeGoal: EmberTool<{ name: string; target: number; date?: string }, unknown> = {
    name: "proposeGoal",
    description: "Prepare a savings goal for the user to confirm (nothing is saved; the app shows a Confirm button).",
    input: z.object({ name: z.string().min(1).max(60), target: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    permission: PERMISSION.PREPARE,
    narration: "Ember drafted a goal for you to confirm",
    handler: async ({ name, target, date }) => {
      const again = alreadyProposed();
      if (again) return again;
      const p: MoneyProposal = { kind: "goal", name, target, date: date ?? null };
      proposed = p;
      onProposal?.(p);
      return { proposed: true, needsYourConfirmation: true, name, target, date: p.date };
    },
  };

  return [
    getFinancialState, getTransactions, listStatements, getStatement, getCardRules, bestCard,
    utilizationImpact, toUtilisation, feeWaiverStatus, explainNudge, proposeBudget, proposeGoal,
  ];
}
