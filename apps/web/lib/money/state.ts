import { and, eq, isNull, or } from "drizzle-orm";
import {
  budgets,
  cardAccounts,
  db,
  financialStateCache,
  savingsGoals,
  statements,
  transactions,
} from "@perq/db";
import { buildFinancialState, istDate, type CardTerms, type FinancialState, type StateInput } from "@perq/finance-engine";
import type { CatalogCard } from "@perq/shared";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { loadSwiggyOrders } from "@/lib/swiggy/service";

// Server side of the financial state (handoff §6): load the user's rows,
// build with finance-engine, cache per user per IST day.

/** Bump when buildFinancialState's output shape changes. */
export const STATE_VERSION = 5; // 3: Step 4 adds `swiggy`; 4: `swiggy.last7Days`; 5: `charges`

export function cardTerms(c: CatalogCard): CardTerms {
  return {
    id: c.id,
    name: c.name,
    rewardRates: c.rewardRates,
    redemptionValue: c.redemptionValue,
    feeWaiverSpend: c.feeWaiverSpend,
    annualFee: c.annualFee,
  };
}

export async function loadStateInput(userId: string, now: Date): Promise<StateInput> {
  const month = istDate(now).slice(0, 7);
  const [catalogue, accounts, stmts, txns, budgetRows, goalRows, swiggyOrders] = await Promise.all([
    loadCatalogue(),
    db.select().from(cardAccounts).where(eq(cardAccounts.userId, userId)),
    db.select().from(statements).where(eq(statements.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), or(eq(budgets.month, month), isNull(budgets.month)))),
    db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)),
    loadSwiggyOrders(userId),
  ]);
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  // A budget for this month wins over the recurring default.
  const budget = budgetRows.find((b) => b.month === month) ?? budgetRows.find((b) => b.month === null) ?? null;

  return {
    now,
    cardAccounts: accounts.map((a) => ({
      id: a.id,
      label: a.cardLabel,
      last4: a.last4,
      issuer: a.issuer,
      creditLimit: a.creditLimit,
      feeAnniversaryMonth: a.feeAnniversaryMonth,
      currentBalanceOverride: a.currentBalanceOverride,
      currentBalanceUpdatedAt: a.currentBalanceUpdatedAt?.toISOString() ?? null,
      isActive: a.isActive,
      statementDay: a.statementDay,
      dueDay: a.dueDay,
      terms: a.cardId && byId.get(a.cardId) ? cardTerms(byId.get(a.cardId)!) : null,
    })),
    statements: stmts.map((s) => ({
      id: s.id,
      cardAccountId: s.cardAccountId,
      statementDate: s.statementDate,
      dueDate: s.dueDate,
      totalDue: s.totalDue,
      minimumDue: s.minimumDue,
      previousBalance: s.previousBalance,
      paymentsCredits: s.paymentsCredits,
      feesCharges: s.feesCharges,
      financeCharges: s.financeCharges,
      creditLimit: s.creditLimit,
      pointsClosing: s.pointsClosing,
      pointsExpiring: s.pointsExpiring,
      pointsExpiryDate: s.pointsExpiryDate,
      reconciled: s.reconciled,
      markedPaidAt: s.markedPaidAt?.toISOString() ?? null,
    })),
    transactions: txns.map((t) => ({
      id: t.id,
      cardAccountId: t.cardAccountId,
      statementId: t.statementId,
      txnDate: t.txnDate,
      amount: t.amount,
      direction: t.direction as "debit" | "credit",
      kind: t.kind,
      category: t.category,
      merchant: t.merchantNormalized,
      description: t.descriptionRaw,
    })),
    budget: budget ? { totalLimit: budget.totalLimit, categoryLimits: budget.categoryLimits as Record<string, number> } : null,
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      savedAmount: g.savedAmount,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
    })),
    swiggyOrders,
  };
}

/** Cached per user per IST day; any money write deletes the cache row. */
export async function getFinancialState(userId: string, now: Date = new Date()): Promise<FinancialState> {
  const today = istDate(now);
  const [cached] = await db.select().from(financialStateCache).where(eq(financialStateCache.userId, userId)).limit(1);
  const state = cached?.state as FinancialState | undefined;
  if (cached && cached.version === STATE_VERSION && state?.asOf === today) return state;

  const fresh = buildFinancialState(await loadStateInput(userId, now));
  await db
    .insert(financialStateCache)
    .values({ userId, version: STATE_VERSION, state: fresh, computedAt: new Date() })
    .onConflictDoUpdate({ target: financialStateCache.userId, set: { version: STATE_VERSION, state: fresh, computedAt: new Date() } });
  return fresh;
}
