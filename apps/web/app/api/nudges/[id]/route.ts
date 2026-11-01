import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, nudges } from "@perq/db";
import { nudgePatchSchema } from "@perq/shared";
import { istDate, nextSendTime } from "@perq/finance-engine";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";

export const dynamic = "force-dynamic";

/** PATCH /api/nudges/:id: opened / acted / dismissed / remind. Never moves an acted nudge back. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const body = nudgePatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const [row] = await db.select().from(nudges).where(and(eq(nudges.id, id), eq(nudges.userId, auth.id))).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const s = body.data.status;
  if (s === "remind") {
    // Back in the queue for the next 09:00 IST after today; the planner sends it then (cap permitting).
    const clock = await nowFor(auth.id);
    const at = nextSendTime(new Date(Date.parse(`${istDate(clock)}T23:59:00+05:30`)));
    await db.update(nudges).set({ status: "queued", scheduledFor: at, actedAt: now }).where(eq(nudges.id, id));
    return NextResponse.json({ ok: true, status: "queued", scheduledFor: at.toISOString() });
  }
  const set =
    s === "opened"
      ? { openedAt: row.openedAt ?? now, status: row.status === "sent" ? "opened" : row.status }
      : s === "acted"
        ? { actedAt: now, openedAt: row.openedAt ?? now, status: "acted" }
        : { dismissedAt: now, status: row.status === "acted" ? "acted" : "dismissed" };
  await db.update(nudges).set(set).where(eq(nudges.id, id));
  return NextResponse.json({ ok: true, status: set.status });
}
