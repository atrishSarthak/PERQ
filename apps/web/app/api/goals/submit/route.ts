import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, goals } from "@perq/db";
import { requireAuth, isAuthed } from "@/lib/auth";
import { hasReachedDailyGoalSearchLimit, MAX_GOAL_SEARCHES_PER_DAY } from "@/lib/goals/rateLimit";
import { MAX_CLARIFYING_ROUNDS } from "@/lib/goals/clarification";
import { computeAndPersistGoalRecommendation } from "@/lib/goals/computeGoalRecommendation";

// SSE narration requires the route to opt out of static/cached behavior and
// the Response to be returned before the pipeline completes.
export const dynamic = "force-dynamic";

const followUpSchema = z.object({
  goalId: z.string().min(1),
  clarification: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().trim().min(1).max(300),
      })
    )
    .min(1)
    .max(MAX_CLARIFYING_ROUNDS),
});

const turnOneSchema = z.object({
  goalText: z.string().trim().min(1).max(300),
});

// Follow-up checked first since it's the more specific shape — both are
// structurally distinguishable by the presence of goalId.
const goalSubmitSchema = z.union([followUpSchema, turnOneSchema]);

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  const parsed = goalSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Tell MIMIR what you're trying to buy first.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  let goalId: string;
  let goalText: string;
  let clarification: { question: string; answer: string }[];

  if ("goalId" in parsed.data) {
    // Follow-up turn — reuses the same goals row from turn 1, never
    // re-checks the rate limit (already counted on turn 1).
    const [goalRow] = await db
      .select({ id: goals.id, goalText: goals.goalText, category: goals.category })
      .from(goals)
      .where(and(eq(goals.id, parsed.data.goalId), eq(goals.userId, user.id)))
      .limit(1);

    if (!goalRow || goalRow.category !== "pending") {
      return NextResponse.json(
        { error: "This search has already finished — start a new one." },
        { status: 400 }
      );
    }

    goalId = goalRow.id;
    goalText = goalRow.goalText;
    clarification = parsed.data.clarification;
  } else {
    // Turn 1 — rate limit checked BEFORE any spend: before understanding
    // the goal, before even writing the goals row. A capped-out user gets
    // a plain, synchronous JSON response, never an opened SSE stream that
    // then fails.
    if (await hasReachedDailyGoalSearchLimit(user.id)) {
      return NextResponse.json(
        {
          error: `You've hit today's limit of ${MAX_GOAL_SEARCHES_PER_DAY} goal searches — MIMIR needs to pace these to keep the search budget fair for everyone. Try again tomorrow.`,
        },
        { status: 429 }
      );
    }

    const [goalRow] = await db
      .insert(goals)
      .values({ userId: user.id, goalText: parsed.data.goalText })
      .returning({ id: goals.id });

    goalId = goalRow!.id;
    goalText = parsed.data.goalText;
    clarification = [];
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        const result = await computeAndPersistGoalRecommendation(
          user.id,
          goalId,
          goalText,
          clarification,
          (label) => emit({ type: "step", label })
        );

        if (result.outcome === "needs_clarification") {
          emit({ type: "clarifying_question", goalId, question: result.question });
        } else {
          emit({ type: "done", ...result });
        }
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
