import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, purchasePlans } from "@perq/db";
import { PlanChoiceError, planPurchase, planTemplateExplanation } from "@perq/finance-engine";
import { planWhatIfRequestSchema, type PlanInput, type PlanWhatIfResponse } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { logActivity } from "@/lib/money/activity";
import { loadPlanContext } from "@/lib/plans/context";
import { explain, getPlanRow, planInputOf } from "@/lib/plans/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/plans/:id/what-if (§9): the plan again with a change (price,
 * need-by) or a pick (card, day, EMI tenure), on fresh state. Not saved, and
 * worded by the template so it's instant; `save: true` keeps this version and
 * has Ember word it.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = planWhatIfRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid what-if" }, { status: 400 });
  const row = await getPlanRow(auth.id, (await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { price, needBy, ...choice } = body.data.changes;
  const base = planInputOf(row);
  const input: PlanInput = { ...base, ...(price ? { price } : {}) };
  if (needBy === null) delete input.needBy;
  else if (needBy) input.needBy = needBy;

  const now = await nowFor(auth.id);
  const { ctx, snapshot } = await loadPlanContext(auth.id, now);
  let result;
  try {
    result = planPurchase(input, ctx, choice);
  } catch (err) {
    if (err instanceof PlanChoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  if (!body.data.save) {
    return NextResponse.json({ result, explanation: planTemplateExplanation(result) } satisfies PlanWhatIfResponse);
  }
  const worded = await explain(auth.id, input, result, "plan_whatif");
  await db
    .update(purchasePlans)
    .set({
      price: input.price,
      needByDate: input.needBy ?? null,
      inputsSnapshot: { ...snapshot, choice },
      result,
      verdict: result.verdict,
      explanation: worded.text,
      explanationSource: worded.source,
      updatedAt: new Date(),
    })
    .where(and(eq(purchasePlans.id, row.id), eq(purchasePlans.userId, auth.id)));
  await logActivity(auth.id, "plan_updated", `Updated a plan: ${row.itemName} (${result.headline})`, { table: "purchase_plans", id: row.id });
  return NextResponse.json({ result, explanation: worded.text } satisfies PlanWhatIfResponse);
}
