import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, nudges } from "@perq/db";
import { nudgePatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH /api/nudges/:id: opened / acted / dismissed. Never moves an acted nudge back. */
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
  const set =
    s === "opened"
      ? { openedAt: row.openedAt ?? now, status: row.status === "sent" ? "opened" : row.status }
      : s === "acted"
        ? { actedAt: now, openedAt: row.openedAt ?? now, status: "acted" }
        : { dismissedAt: now, status: row.status === "acted" ? "acted" : "dismissed" };
  await db.update(nudges).set(set).where(eq(nudges.id, id));
  return NextResponse.json({ ok: true, status: set.status });
}
