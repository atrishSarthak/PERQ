import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { activityEvents, db, nudges } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { getFinancialState } from "@/lib/money/state";

export const dynamic = "force-dynamic";

/** GET /api/activity: "What Ember did" (§10.8): recent events plus this week's counts. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const now = await nowFor(auth.id);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [events, weekNudges, state] = await Promise.all([
    db.select().from(activityEvents).where(eq(activityEvents.userId, auth.id)).orderBy(desc(activityEvents.createdAt)).limit(60),
    db.select({ status: nudges.status, actedAt: nudges.actedAt }).from(nudges).where(and(eq(nudges.userId, auth.id), gte(nudges.sentAt, weekAgo))),
    getFinancialState(auth.id, now),
  ]);
  return NextResponse.json({
    events: events.map((e) => ({ id: e.id, type: e.type, summary: e.summary, createdAt: e.createdAt.toISOString() })),
    week: {
      nudgesSent: weekNudges.length,
      nudgesActed: weekNudges.filter((n) => n.actedAt).length,
      statementsRead: events.filter((e) => e.type === "statement_parsed" && e.createdAt >= weekAgo).length,
      missedRewardsFound: state.missedRewardsLastCycle.total,
    },
  });
}
