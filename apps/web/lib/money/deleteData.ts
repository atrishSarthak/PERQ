import { and, eq, isNotNull } from "drizzle-orm";
import {
  activityEvents,
  budgets,
  cardAccounts,
  chatMessages,
  db,
  financialStateCache,
  nudges,
  savingsGoals,
  userMerchantOverrides,
  userProfile,
} from "@perq/db";

/**
 * Every statement, transaction, card account, budget, goal, nudge, nudge/card
 * chat, merchant override, the cached state and activity (§10.9, §12).
 * Consents stay: they're the dated record of what the user agreed to.
 */
export async function deleteFinancialData(userId: string): Promise<void> {
  // card_accounts cascades to statements and transactions.
  await db.delete(cardAccounts).where(eq(cardAccounts.userId, userId));
  await db.delete(nudges).where(eq(nudges.userId, userId));
  await db.delete(chatMessages).where(and(eq(chatMessages.userId, userId), isNotNull(chatMessages.threadRef)));
  await db.delete(budgets).where(eq(budgets.userId, userId));
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
  await db.delete(userMerchantOverrides).where(eq(userMerchantOverrides.userId, userId));
  await db.delete(financialStateCache).where(eq(financialStateCache.userId, userId));
  await db.delete(activityEvents).where(eq(activityEvents.userId, userId));
  await db.update(userProfile).set({ spendSource: "quiz", syncedSpend: null }).where(eq(userProfile.userId, userId));
}
