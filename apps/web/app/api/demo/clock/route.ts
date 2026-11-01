import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { demoEnabled, nowFor, setDemoClock } from "@/lib/money/clock";
import { invalidateState } from "@/lib/money/activity";
import { runNudgeEngine } from "@/lib/money/nudgeEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.union([
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.+)?$/) }),
  z.object({ days: z.number().int().min(-60).max(60) }),
  z.object({ reset: z.literal(true) }),
]);

/** GET/POST /api/demo/clock (§13.4): read or move a demo user's clock, then run the nudge engine. */
export async function GET(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const [u] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, auth.id)).limit(1);
  return NextResponse.json({ isDemo: !!u?.isDemo, now: (await nowFor(auth.id)).toISOString() });
}

export async function POST(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const [u] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, auth.id)).limit(1);
  if (!u?.isDemo) return NextResponse.json({ error: "Time travel is only for a demo account. Load demo data first." }, { status: 403 });
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Send { date }, { days } or { reset: true }" }, { status: 400 });
  const current = await nowFor(auth.id);
  // A date-only value means 09:00 IST that day, when the daily run sends.
  const at =
    "reset" in b.data ? null : "days" in b.data ? new Date(current.getTime() + b.data.days * 86_400_000) : new Date(b.data.date.length === 10 ? `${b.data.date}T09:00:00+05:30` : b.data.date);
  if (at && Number.isNaN(at.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  await setDemoClock(auth.id, at);
  await invalidateState(auth.id);
  const now = await nowFor(auth.id);
  const run = await runNudgeEngine(auth.id, now);
  return NextResponse.json({ now: now.toISOString(), nudgesSent: run.sent.length, quietHours: run.quietHours });
}
