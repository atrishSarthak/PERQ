import { and, eq, gte, sql } from "drizzle-orm";
import { db, goals } from "@perq/db";

/**
 * v2 (open-ended web-search redesign): Firecrawl credits no longer apply —
 * the binding cost constraint is now Gemini's own free-tier quota, shared
 * across every PERQ feature on the same API key (~1,000 requests/day total,
 * with grounded-search calls drawing from their own ~1,500/day sub-quota).
 * A single goal search costs roughly 5-7 Gemini calls with no clarification
 * needed (understand + 1-2 grounded discovery calls + up to 3 precision-
 * fetch extractions + narration), up to ~13 calls in the worst case (3
 * clarifying rounds, each re-running understandGoal). At 5 searches/user/day
 * that's up to ~65 calls/user/day worst case — a real throttle against the
 * shared quota, not effectively unlimited, while giving genuine headroom for
 * a multi-turn clarification conversation to feel natural rather than
 * stingy. A starting point, easy to adjust once real usage is observed.
 */
export const MAX_GOAL_SEARCHES_PER_DAY = 5;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * D8: checked at the FIRST line of the goal-submit route, before
 * classification even runs — a capped-out user triggers zero spend, not
 * even a classification call. UTC calendar day boundary (no per-user
 * timezone captured anywhere — the 5:30am IST quirk this creates is
 * tracked in TODOS.md, not fixed here).
 *
 * Known, accepted TOCTOU race (D8): this is a COUNT-then-INSERT check, not
 * an atomic increment — two concurrent requests can both pass this check
 * before either's goals row lands, letting a user go 1-2 searches over the
 * cap in the rare double-tab/double-click case. Deliberately left unfixed
 * per the outside-voice pass's judgment: a soft usage guardrail (PRD §16:
 * "no UI for adjusting... revisit once real usage exists"), not a hard
 * resource or billing boundary — atomic-counter machinery would be
 * over-engineered relative to the actual stakes.
 */
export async function hasReachedDailyGoalSearchLimit(
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(goals)
    .where(and(eq(goals.userId, userId), gte(goals.createdAt, startOfUtcDay(now))));

  return (row?.count ?? 0) >= MAX_GOAL_SEARCHES_PER_DAY;
}
