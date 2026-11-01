import { NextResponse } from "next/server";
import { planMatchRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { confirmPlanMatch, PlanMatchError } from "@/lib/plans/match";
import { getPlanRow, planDetail } from "@/lib/plans/service";

export const dynamic = "force-dynamic";

/** POST /api/plans/:id/match (§8): the user confirms a statement line is this plan's purchase. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = planMatchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await getPlanRow(auth.id, (await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await confirmPlanMatch(auth.id, row, body.data.transactionId, await nowFor(auth.id));
  } catch (err) {
    if (err instanceof PlanMatchError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  return NextResponse.json(await planDetail((await getPlanRow(auth.id, row.id))!));
}
