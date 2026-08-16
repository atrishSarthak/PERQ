import { and, eq, gte, sql } from "drizzle-orm";
import { db, goals } from "@perq/db";

/**
 * Engineering Plan D8: revised from PRD §12's illustrative 8/day down to
 * 3/day — the outside-voice pass's Firecrawl credit math showed 8/day/user
 * could exhaust the entire shared 1,000-credit/month budget in 1-2 days.
 * Exact per-channel credit cost should be reconfirmed against Firecrawl's
 * real dashboard (T0 spike — currently BLOCKED in this environment, no
 * FIRECRAWL_API_KEY available) before treating 3 as final.
 */
export const MAX_GOAL_SEARCHES_PER_DAY = 3;

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
