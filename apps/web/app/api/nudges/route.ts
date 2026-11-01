import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, nudges } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { runNudgeEngine } from "@/lib/money/nudgeEngine";

export const dynamic = "force-dynamic";

// Opening the inbox also runs the engine (throttled), so a local
// notification scheduled on the device in Expo Go finds its nudge here.
const RUN_EVERY_MS = 5 * 60_000;
const lastRun = new Map<string, number>();

/** GET /api/nudges: the inbox (sent and later states), newest first. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  if (Date.now() - (lastRun.get(auth.id) ?? 0) > RUN_EVERY_MS) {
    lastRun.set(auth.id, Date.now());
    await runNudgeEngine(auth.id, await nowFor(auth.id)).catch((err) =>
      console.error("nudge engine failed", { userId: auth.id, error: err instanceof Error ? err.message : "unknown" })
    );
  }
  const rows = await db
    .select()
    .from(nudges)
    .where(and(eq(nudges.userId, auth.id), inArray(nudges.status, ["sent", "opened", "acted", "dismissed"])))
    .orderBy(desc(nudges.sentAt))
    .limit(50);
  return NextResponse.json({
    nudges: rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      dedupeKey: r.dedupeKey,
      title: r.title,
      body: r.body,
      status: r.status,
      priority: r.priority,
      cardAccountId: r.cardAccountId,
      sentAt: r.sentAt?.toISOString() ?? null,
      openedAt: r.openedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread: rows.filter((r) => r.status === "sent").length,
  });
}
