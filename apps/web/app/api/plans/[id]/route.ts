import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, purchasePlans } from "@perq/db";
import { planPatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/money/activity";
import { getPlanRow, planDetail } from "@/lib/plans/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/plans/:id: the plan, its result and Ember's answer, plus the matched transaction once bought. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const row = await getPlanRow(auth.id, (await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await planDetail(row));
}

const STATUS_ACTIVITY: Record<string, string> = {
  bought: "Marked a plan as bought",
  dropped: "Dropped a plan",
  planned: "Saved a plan",
};

/** PATCH /api/plans/:id (§8): status, reminder day, need-by date. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = planPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const row = await getPlanRow(auth.id, (await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = body.data;
  const [updated] = await db
    .update(purchasePlans)
    .set({
      ...(p.status ? { status: p.status } : {}),
      ...(p.remindAt !== undefined ? { remindAt: p.remindAt } : {}),
      ...(p.needBy !== undefined ? { needByDate: p.needBy } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(purchasePlans.id, row.id), eq(purchasePlans.userId, auth.id)))
    .returning();
  if (p.status && STATUS_ACTIVITY[p.status]) await logActivity(auth.id, `plan_${p.status}`, `${STATUS_ACTIVITY[p.status]}: ${row.itemName}`, { table: "purchase_plans", id: row.id });
  return NextResponse.json(await planDetail(updated!));
}

/** DELETE /api/plans/:id */
export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const row = await getPlanRow(auth.id, (await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(purchasePlans).where(and(eq(purchasePlans.id, row.id), eq(purchasePlans.userId, auth.id)));
  return NextResponse.json({ ok: true });
}
