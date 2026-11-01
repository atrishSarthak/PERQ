import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, savingsGoals } from "@perq/db";
import { goalPatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { afterMoneyWrite } from "@/lib/money/hooks";

export const dynamic = "force-dynamic";

/** PATCH /api/goals/:id: edit, add savings, finish or archive. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const body = goalPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid change" }, { status: 400 });
  const rows = await db
    .update(savingsGoals)
    .set({ ...body.data, updatedAt: new Date() })
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, auth.id)))
    .returning({ name: savingsGoals.name });
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await invalidateState(auth.id);
  await logActivity(auth.id, "goal_updated", `Updated the goal "${rows[0]!.name}"`, { table: "savings_goals", id });
  await afterMoneyWrite(auth.id, "goal_changed");
  return NextResponse.json({ ok: true });
}
