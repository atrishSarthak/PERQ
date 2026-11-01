import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, nudges } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { explainNudge } from "@/lib/money/nudgeWhy";

export const dynamic = "force-dynamic";

/** GET /api/nudges/:id/why: the rule, its numbers, and the data date (§7.4). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const [row] = await db.select().from(nudges).where(and(eq(nudges.id, id), eq(nudges.userId, auth.id))).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(explainNudge(row));
}
