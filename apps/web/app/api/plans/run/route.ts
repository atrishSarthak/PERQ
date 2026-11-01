import { NextResponse } from "next/server";
import { chatMessages, db } from "@perq/db";
import { planMarker } from "@/lib/ember/plans/prompts";
import { planRunRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { computePlan, explain, PLAN_DAILY_LIMIT, plansRunToday, savePlan } from "@/lib/plans/service";
import { planNarration } from "@perq/finance-engine";
import { sleep, sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/plans/run (Step 3 §7.2): a CONFIRMED PlanInput → PlanResult +
 * Ember's answer, streamed as narration steps then a `plan` event. The
 * engine runs first; the model only words the result.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = planRunRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Check the item and price", issues: body.error.issues.slice(0, 5) }, { status: 400 });
  const now = await nowFor(auth.id);
  if ((await plansRunToday(auth.id, now)) >= PLAN_DAILY_LIMIT) {
    return NextResponse.json({ error: `You've planned ${PLAN_DAILY_LIMIT} purchases today. Try again tomorrow.` }, { status: 429 });
  }
  const { input, source, postToChat } = body.data;

  return sseResponse(async (emit) => {
    const computed = await computePlan(auth.id, input, now);
    const steps = planNarration(computed.result, computed.monthName);
    const explaining = explain(auth.id, input, computed.result);
    for (const label of steps.slice(0, -1)) {
      emit({ type: "step", label });
      await sleep(350);
    }
    emit({ type: "step", label: steps.at(-1)! });
    const explanation = await explaining;
    const row = await savePlan(auth.id, input, source, computed, explanation);
    // Confirmed from the chat card: Ember's answer joins the main thread, with a marker the app shows as the result card.
    if (postToChat) {
      await db.insert(chatMessages).values({ userId: auth.id, thread: "recommender", threadRef: null, role: "assistant", content: `${explanation.text}\n\n${planMarker(row.id)}` });
    }
    emit({ type: "plan", planId: row.id, result: computed.result, explanation: explanation.text, explanationSource: explanation.source });
    emit({ type: "done" });
  });
}
