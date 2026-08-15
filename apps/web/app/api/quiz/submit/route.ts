import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, userProfile } from "@perq/db";
import { requireAuth, isAuthed } from "@/lib/auth";
import { quizAnswersSchema } from "@/lib/mimir/quizAnswersSchema";
import { computeAndPersistRecommendations } from "@/lib/mimir/computeRecommendations";

// D3: SSE narration requires the route to opt out of static/cached
// behavior and the Response to be returned before the loop completes —
// buffering it defeats streaming on Vercel.
export const dynamic = "force-dynamic";

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  const parsed = quizAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quiz answers", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const answers = parsed.data;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        // Plain server-side step, not narrated — saving the form isn't an
        // agentic action; MIMIR's own narration starts once the agent
        // reads this back via the getUserProfile tool.
        await db
          .insert(userProfile)
          .values({ userId: user.id, answers })
          .onConflictDoUpdate({
            target: userProfile.userId,
            set: { answers, updatedAt: new Date() },
          });

        const result = await computeAndPersistRecommendations(
          user.id,
          answers,
          (label) => emit({ type: "step", label }),
          undefined,
          // A completed quiz (new user or "Retake the Quiz") always gets a
          // fresh, context-grounded web search rather than a possibly-stale
          // cached bucket — see resolveCardSet's forceRefresh doc comment.
          true
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
