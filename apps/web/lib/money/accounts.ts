import { and, desc, eq } from "drizzle-orm";
import { cardAccounts, db, statements } from "@perq/db";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { getFinancialState } from "./state";

// Card account views for the apps (handoff §10.3, §10.4). Every figure comes
// from the financial state, so screens never compute rupees themselves.

export function statementItem(s: typeof statements.$inferSelect, label: string, last4: string) {
  return {
    id: s.id,
    cardAccountId: s.cardAccountId,
    cardLabel: label,
    last4,
    statementDate: s.statementDate,
    dueDate: s.dueDate,
    totalDue: s.totalDue,
    minimumDue: s.minimumDue,
    reconciled: s.reconciled,
    markedPaid: !!s.markedPaidAt,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function cardAccountDetail(userId: string, id: string, now: Date) {
  const [account] = await db.select().from(cardAccounts).where(and(eq(cardAccounts.id, id), eq(cardAccounts.userId, userId))).limit(1);
  if (!account) return null;
  const [state, stmts, catalogue] = await Promise.all([
    getFinancialState(userId, now),
    db.select().from(statements).where(eq(statements.cardAccountId, id)).orderBy(desc(statements.statementDate)),
    loadCatalogue(),
  ]);
  return {
    account: {
      id: account.id,
      cardLabel: account.cardLabel,
      issuer: account.issuer,
      last4: account.last4,
      catalogueCardId: account.cardId,
      catalogueCardName: account.cardId ? catalogue.find((c) => c.id === account.cardId)?.name ?? null : null,
      statementDay: account.statementDay,
      dueDay: account.dueDay,
      creditLimit: account.creditLimit,
      currentBalanceOverride: account.currentBalanceOverride,
      currentBalanceUpdatedAt: account.currentBalanceUpdatedAt?.toISOString() ?? null,
    },
    card: state.cards.find((c) => c.cardAccountId === id) ?? null,
    missedRewards: state.missedRewardsLastCycle.items.filter((m) => m.usedCardAccountId === id),
    statements: stmts.map((s) => statementItem(s, account.cardLabel, account.last4)),
    dataThrough: state.dataThrough,
  };
}
