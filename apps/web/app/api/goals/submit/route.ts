import { NextResponse } from "next/server";
import { z } from "zod";
import { db, goals } from "@perq/db";
import { requireAuth, isAuthed } from "@/lib/auth";
import { hasReachedDailyGoalSearchLimit, MAX_GOAL_SEARCHES_PER_DAY } from "@/lib/goals/rateLimit";
import { computeAndPersistGoalRecommendation } from "@/lib/goals/computeGoalRecommendation";

// D3 (Feature 1 pattern, reused): SSE narration requires the route to opt
// out of static/cached behavior and the Response to be returned before the
// pipeline completes.
export const dynamic = "force-dynamic";

const goalSubmitSchema = z.object({
  goalText: z.string().trim().min(1).max(300),
});

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
  const { goalText } = parsed.data;

  // D8: rate limit is checked BEFORE any spend — before classification,
  // before even writing the goals row. A capped-out user gets a plain,
  // synchronous JSON response, never an opened SSE stream that then fails.
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
    .values({ userId: user.id, goalText })
    .returning({ id: goals.id });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        const result = await computeAndPersistGoalRecommendation(
          user.id,
          goalRow!.id,
          goalText,
          (label) => emit({ type: "step", label })
        );
        emit({ type: "done", ...result });
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
