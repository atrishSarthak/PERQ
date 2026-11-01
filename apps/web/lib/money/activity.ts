import { db, activityEvents, financialStateCache } from "@perq/db";
import { eq } from "drizzle-orm";

/**
 * "What Ember did" (§10.8). Summaries are written by code from counts and
 * card names. Never transaction descriptions, never passwords.
 */
export async function logActivity(userId: string, type: string, summary: string, ref?: { table: string; id: string }) {
  await db.insert(activityEvents).values({ userId, type, summary, refTable: ref?.table ?? null, refId: ref?.id ?? null });
}

/** Any write to a user's money data drops the cached financial state (§4). */
export async function invalidateState(userId: string) {
  await db.delete(financialStateCache).where(eq(financialStateCache.userId, userId));
}
