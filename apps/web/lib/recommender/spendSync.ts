import { eq } from "drizzle-orm";
import { db, statements, transactions, userProfile } from "@perq/db";
import { averageMonthlySpend, type MonthlySpend } from "@perq/finance-engine";
import { statementSpendToMonthly } from "@perq/scoring-engine";

// Recommender sync with real spend (handoff §9). Average monthly spend over
// each card's last 3 reconciled statements replaces the quiz buckets once
// the user opts in; Profile can switch back.

export interface SyncedSpend {
  spend: MonthlySpend;
  statementCount: number;
  dataThrough: string | null;
  computedAt: string;
}

export async function statementSpend(userId: string): Promise<Omit<SyncedSpend, "computedAt">> {
  const [stmts, txns] = await Promise.all([
    db.select().from(statements).where(eq(statements.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
  ]);
  const avg = averageMonthlySpend(stmts, txns);
  return { spend: statementSpendToMonthly(avg.perMonth), statementCount: avg.statementCount, dataThrough: avg.dataThrough };
}

export async function getSpendSource(userId: string): Promise<{ source: "quiz" | "statements"; synced: SyncedSpend | null }> {
  const [row] = await db.select({ source: userProfile.spendSource, synced: userProfile.syncedSpend }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const synced = (row?.synced as SyncedSpend | null) ?? null;
  return { source: row?.source === "statements" && synced ? "statements" : "quiz", synced };
}

/** Switch the recommender to statements (needs ≥ 1 reconciled statement) or back to the quiz. */
export async function setSpendSource(userId: string, source: "quiz" | "statements"): Promise<{ ok: boolean; reason?: string }> {
  if (source === "quiz") {
    await db.update(userProfile).set({ spendSource: "quiz", updatedAt: new Date() }).where(eq(userProfile.userId, userId));
    return { ok: true };
  }
  const s = await statementSpend(userId);
  if (!s.statementCount) return { ok: false, reason: "Upload a statement whose totals add up first." };
  const synced: SyncedSpend = { ...s, computedAt: new Date().toISOString() };
  const rows = await db
    .update(userProfile)
    .set({ spendSource: "statements", syncedSpend: synced, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId))
    .returning({ id: userProfile.id });
  if (!rows.length) return { ok: false, reason: "Take the quiz first." };
  return { ok: true };
}

/** After a statement is saved or deleted: keep a synced profile current. */
export async function refreshSyncedSpend(userId: string): Promise<void> {
  const { source } = await getSpendSource(userId);
  if (source !== "statements") return;
  const s = await statementSpend(userId);
  if (!s.statementCount) {
    await db.update(userProfile).set({ spendSource: "quiz", syncedSpend: null }).where(eq(userProfile.userId, userId));
    return;
  }
  await db.update(userProfile).set({ syncedSpend: { ...s, computedAt: new Date().toISOString() } }).where(eq(userProfile.userId, userId));
}
