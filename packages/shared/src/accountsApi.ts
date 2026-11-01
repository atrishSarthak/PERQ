import { z } from "zod";
import { txnCategorySchema } from "./money";

// Card accounts, transactions and the financial state as the apps read them
// (handoff §6, §11). The state is built by finance-engine; these schemas
// check the fields the screens use and pass the rest through.

const n = z.number().nullable();

export const cardStateSchema = z
  .object({
    cardAccountId: z.string(),
    label: z.string(),
    last4: z.string(),
    issuer: z.string(),
    catalogueCardId: z.string().nullable(),
    latestStatement: z
      .object({ id: z.string(), date: z.string(), dueDate: z.string().nullable(), totalDue: n, minimumDue: n, reconciled: z.boolean(), financeCharges: n })
      .passthrough()
      .nullable(),
    daysToDue: n,
    isPaidMarked: z.boolean(),
    creditLimit: n,
    balanceForUtilisation: n,
    balanceSource: z.enum(["statement", "override"]).nullable(),
    utilisationPct: n,
    nextStatementDate: z.string().nullable(),
    daysToStatement: n,
    points: z.object({ closing: z.number(), valueRupees: n, expiring: n, expiryDate: z.string().nullable() }).nullable(),
    feeWaiver: z
      .object({ threshold: z.number(), annualFee: z.number(), spentThisCardYear: z.number(), remaining: z.number(), monthsLeft: z.number(), onPace: z.boolean(), cardYearEnds: z.string() })
      .passthrough()
      .nullable(),
    feesLastCycle: z.object({ total: z.number(), lines: z.array(z.object({ description: z.string(), amount: z.number() })) }),
  })
  .passthrough();
export type CardStateView = z.infer<typeof cardStateSchema>;

export const missedRewardSchema = z.object({
  txnId: z.string(),
  date: z.string(),
  merchant: z.string(),
  category: z.string(),
  amount: z.number(),
  usedCardAccountId: z.string(),
  usedCard: z.string(),
  betterCard: z.string(),
  betterCardId: z.string(),
  extra: z.number(),
});

export const financialStateSchema = z
  .object({
    asOf: z.string(),
    dataThrough: z.string().nullable(),
    cards: z.array(cardStateSchema),
    totals: z.object({ totalDueAll: z.number(), utilisationOverallPct: n }),
    month: z.object({
      key: z.string(),
      spendByCategory: z.record(z.number()),
      totalSpend: z.number(),
      budget: z.object({ totalLimit: n, categoryLimits: z.record(z.number()) }).nullable(),
      leftToSpend: n,
      daysLeft: z.number(),
      coverage: z.enum(["complete", "partial"]),
    }),
    missedRewardsLastCycle: z.object({ total: z.number(), items: z.array(missedRewardSchema) }),
    goals: z.array(
      z.object({ id: z.string(), name: z.string(), target: z.number(), saved: z.number(), pctDone: z.number(), monthlyNeeded: n, expectedSaved: n, behindBy: z.number(), targetDate: z.string().nullable() })
    ),
  })
  .passthrough();
export type FinancialStateView = z.infer<typeof financialStateSchema>;
export const stateResponseSchema = z.object({ state: financialStateSchema });

export const transactionItemSchema = z.object({
  id: z.string(),
  cardAccountId: z.string(),
  statementId: z.string(),
  date: z.string(),
  description: z.string(),
  merchant: z.string(),
  amount: z.number(),
  direction: z.enum(["debit", "credit"]),
  kind: z.string(),
  category: z.string(),
  categorySource: z.string(),
  isInternational: z.boolean(),
});
export type TransactionItem = z.infer<typeof transactionItemSchema>;
export const transactionsResponseSchema = z.object({ transactions: z.array(transactionItemSchema), total: z.number().int() });

export const transactionPatchSchema = z.object({
  category: txnCategorySchema,
  /** Apply to this merchant's other transactions and future uploads (yours only). */
  rememberForMerchant: z.boolean().default(true),
});

export const statementListItemSchema = z.object({
  id: z.string(),
  cardAccountId: z.string(),
  cardLabel: z.string(),
  last4: z.string(),
  statementDate: z.string(),
  dueDate: z.string().nullable(),
  totalDue: n,
  minimumDue: n,
  reconciled: z.boolean(),
  markedPaid: z.boolean(),
  createdAt: z.string(),
});
export const statementsResponseSchema = z.object({ statements: z.array(statementListItemSchema) });

export const cardAccountDetailSchema = z.object({
  account: z.object({
    id: z.string(),
    cardLabel: z.string(),
    issuer: z.string(),
    last4: z.string(),
    catalogueCardId: z.string().nullable(),
    catalogueCardName: z.string().nullable(),
    statementDay: n,
    dueDay: n,
    creditLimit: n,
    currentBalanceOverride: n,
    currentBalanceUpdatedAt: z.string().nullable(),
  }),
  card: cardStateSchema.nullable(),
  missedRewards: z.array(missedRewardSchema),
  statements: z.array(statementListItemSchema),
  dataThrough: z.string().nullable(),
});
export type CardAccountDetail = z.infer<typeof cardAccountDetailSchema>;
export const cardAccountsResponseSchema = z.object({ cards: z.array(cardStateSchema), dataThrough: z.string().nullable() });

// Budgets & goals (§10.7), activity (§10.8).
const rupeesInt = z.number().int().positive().max(100_000_000);

export const budgetPutSchema = z.object({
  /** YYYY-MM for one month; null for the recurring default. */
  month: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  totalLimit: rupeesInt.nullable(),
  categoryLimits: z.record(txnCategorySchema, rupeesInt),
});
export type BudgetPut = z.infer<typeof budgetPutSchema>;

export const budgetResponseSchema = z.object({
  month: z.string(),
  budget: z.object({ month: z.string().nullable(), totalLimit: n, categoryLimits: z.record(z.number()) }).nullable(),
  spendByCategory: z.record(z.number()),
  /** Prefill: average monthly spend from statements (or null). */
  suggested: z.object({ perMonth: z.record(z.number()), total: z.number(), statementCount: z.number() }).nullable(),
});

export const goalCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  targetAmount: rupeesInt,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  savedAmount: z.number().int().min(0).max(100_000_000).optional(),
});
export const goalPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    targetAmount: rupeesInt.optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    savedAmount: z.number().int().min(0).max(100_000_000).optional(),
    status: z.enum(["active", "done", "archived"]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nothing to change");
export const goalsResponseSchema = z.object({
  goals: z.array(
    z.object({ id: z.string(), name: z.string(), targetAmount: z.number(), targetDate: z.string().nullable(), savedAmount: z.number(), status: z.string(), pctDone: z.number(), monthlyNeeded: n, behindBy: z.number() })
  ),
});

export const activityResponseSchema = z.object({
  events: z.array(z.object({ id: z.string(), type: z.string(), summary: z.string(), createdAt: z.string() })),
  week: z.object({ nudgesSent: z.number(), nudgesActed: z.number(), statementsRead: z.number(), missedRewardsFound: z.number() }),
});
