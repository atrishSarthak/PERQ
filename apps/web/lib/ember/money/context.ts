import { and, eq, gte } from "drizzle-orm";
import { db, nudges, statements, transactions } from "@perq/db";
import { buildFinancialState, type NudgePayload } from "@perq/finance-engine";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { explainNudge } from "@/lib/money/nudgeWhy";
import { loadStateInput } from "@/lib/money/state";
import type { MoneyToolContext } from "./tools";

const NUDGE_DAYS = 60;

/** Everything the money tools read for one user, or null when they have no statements yet. */
export async function moneyContext(userId: string, now: Date): Promise<MoneyToolContext | null> {
  const [input, stmts, txns, nudgeRows, catalogue] = await Promise.all([
    loadStateInput(userId, now),
    db.select().from(statements).where(eq(statements.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(nudges).where(and(eq(nudges.userId, userId), gte(nudges.createdAt, new Date(now.getTime() - NUDGE_DAYS * 86_400_000)))),
    loadCatalogue(),
  ]);
  if (!stmts.length) return null;
  return {
    state: buildFinancialState(input),
    statements: stmts.map((s) => ({
      id: s.id, cardAccountId: s.cardAccountId, statementDate: s.statementDate, dueDate: s.dueDate, totalDue: s.totalDue, minimumDue: s.minimumDue,
      previousBalance: s.previousBalance, paymentsCredits: s.paymentsCredits, purchasesDebits: s.purchasesDebits, feesCharges: s.feesCharges,
      financeCharges: s.financeCharges, creditLimit: s.creditLimit, reconciled: s.reconciled,
    })),
    transactions: txns.map((t) => ({
      id: t.id, cardAccountId: t.cardAccountId, date: t.txnDate, merchant: t.merchantNormalized, amount: t.amount,
      direction: t.direction as "debit" | "credit", kind: t.kind, category: t.category,
    })),
    catalogue,
    heldTerms: input.cardAccounts.flatMap((a) => (a.terms && a.isActive ? [a.terms] : [])),
    nudges: nudgeRows.map((n) => ({ id: n.id, ruleId: n.ruleId, title: n.title, body: n.body, payload: n.payload as NudgePayload, why: explainNudge(n) })),
  };
}
