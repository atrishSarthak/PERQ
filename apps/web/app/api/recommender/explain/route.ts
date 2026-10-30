import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logAgentRun } from "@/lib/ember/agentRunLog";
import { explainRecommendation, geminiCaller } from "@/lib/ember/recommender/run";
import { recommenderContext } from "@/lib/recommender/context";
import { saveExplanation } from "@/lib/recommender/service";
import { sleep, sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/recommender/explain (SSE): Ember's narration steps, then the
 * Top Pick explanation. If the Top Pick hasn't changed since the last
 * explanation, the cached one is replayed (no Gemini call).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const ctx = await recommenderContext(auth.id);
  if (!ctx) return NextResponse.json({ error: "Take the quiz first." }, { status: 404 });

  return sseResponse(async (emit) => {
    const top = ctx.result.ranked[0];
    const cached = ctx.response.explanation;
    if (cached && top && cached.topCardId === top.cardId) {
      for (const label of ["Checked your answers", "Worked out your yearly value for each", "Writing your recommendation"]) {
        emit({ type: "step", label });
        await sleep(200);
      }
      emit({ type: "explanation", text: cached.text, source: "cached", topCardId: top.cardId });
      emit({ type: "done" });
      return;
    }

    const answer = await explainRecommendation({
      userId: auth.id,
      answers: ctx.answers,
      result: ctx.result,
      catalogue: ctx.catalogue,
      heldCardIds: ctx.heldCardIds,
      callModel: geminiCaller(),
      onLabel: (label) => emit({ type: "step", label }),
      logRun: logAgentRun,
    });
    if (top) {
      await saveExplanation(auth.id, top.cardId, answer.text, answer.source);
      emit({ type: "explanation", text: answer.text, source: answer.source, topCardId: top.cardId });
    } else {
      emit({ type: "explanation", text: answer.text, source: answer.source, topCardId: "" });
    }
    emit({ type: "done" });
  });
}
