import { NextResponse } from "next/server";
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
import { isAuthed, requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/money/activity";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/me/financial-data (§10.9, §12): every statement, transaction,
 * card account, budget, goal, nudge, nudge/card chat, merchant override, the
 * cached state and activity. Immediate. Consents stay (they're the record of
 * what the user agreed to), and the quiz profile goes back to quiz spend.
 */
export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const u = auth.id;
  // card_accounts cascades to statements and transactions.
  await db.delete(cardAccounts).where(eq(cardAccounts.userId, u));
  await db.delete(nudges).where(eq(nudges.userId, u));
  await db.delete(chatMessages).where(and(eq(chatMessages.userId, u), isNotNull(chatMessages.threadRef)));
  await db.delete(budgets).where(eq(budgets.userId, u));
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, u));
  await db.delete(userMerchantOverrides).where(eq(userMerchantOverrides.userId, u));
  await db.delete(financialStateCache).where(eq(financialStateCache.userId, u));
  await db.delete(activityEvents).where(eq(activityEvents.userId, u));
  await db.update(userProfile).set({ spendSource: "quiz", syncedSpend: null }).where(eq(userProfile.userId, u));
  await logActivity(u, "financial_data_deleted", "Deleted all your financial data");
  return NextResponse.json({ deleted: true });
}
