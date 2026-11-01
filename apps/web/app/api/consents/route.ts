import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { consents, db } from "@perq/db";
import { consentRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { recordConsent } from "@/lib/money/consent";
import { logActivity } from "@/lib/money/activity";

export const dynamic = "force-dynamic";

/** GET /api/consents: history with dates + current state per source. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const rows = await db.select().from(consents).where(eq(consents.userId, auth.id)).orderBy(desc(consents.createdAt));
  const latest = (src: string) => rows.find((r) => r.source === src)?.granted ?? false;
  return NextResponse.json({
    consents: rows.map((r) => ({ source: r.source, granted: r.granted, noticeVersion: r.noticeVersion, createdAt: r.createdAt.toISOString() })),
    current: { statements: latest("statements"), notifications: latest("notifications") },
  });
}

/** POST /api/consents: record a consent decision (append-only). */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = consentRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid consent" }, { status: 400 });
  await recordConsent(auth.id, body.data.source, body.data.granted, body.data.noticeVersion);
  await logActivity(auth.id, "consent", `${body.data.granted ? "Allowed" : "Turned off"} ${body.data.source === "statements" ? "statement reading" : "notifications"}`);
  return NextResponse.json({ ok: true });
}
