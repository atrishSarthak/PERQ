import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { demoEnabled } from "@/lib/money/clock";
import { resetDemo } from "@/lib/money/demo";

export const dynamic = "force-dynamic";

/** POST /api/demo/reset: clear the demo data and the clock. Demo users only. */
export async function POST(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const [u] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, auth.id)).limit(1);
  if (!u?.isDemo) return NextResponse.json({ error: "Only a demo account can be reset." }, { status: 403 });
  await resetDemo(auth.id);
  return NextResponse.json({ reset: true });
}
