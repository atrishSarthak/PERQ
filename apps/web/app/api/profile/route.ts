import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, recommendations, userProfile } from "@perq/db";
import type { QuizAnswers } from "@perq/scoring-engine";
import { requireAuth, isAuthed } from "@/lib/auth";
import { profileEditSchema, validateFieldValue } from "@/lib/mimir/profileFieldSchema";
import {
  computeAndPersistRecommendations,
  type PreviousTopCard,
} from "@/lib/mimir/computeRecommendations";

/**
 * PATCH /api/profile — edits one of the 13 quiz answers (PRD §11).
 * Re-scores immediately (no loading state, §11) and only re-triggers a
 * Gemini explanation call if the #1-ranked card actually changes (§9.5) —
 * that guard lives in computeAndPersistRecommendations via previousTopCard.
 * Last-write-wins (D12) — no optimistic concurrency check. On a write
 * failure, returns an explicit error and leaves prior state untouched (2D).
 */
export async function PATCH(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  const parsedRequest = profileEditSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsedRequest.error.issues },
      { status: 400 }
    );
  }
  const { field, value } = parsedRequest.data;

  const fieldValidation = validateFieldValue(field, value);
  if (!fieldValidation.success) {
    return NextResponse.json({ error: fieldValidation.error }, { status: 400 });
  }

  const [existingProfile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .limit(1);

  if (!existingProfile) {
    return NextResponse.json(
      { error: "No profile found — complete the quiz first." },
      { status: 404 }
    );
  }

  const currentAnswers = existingProfile.answers as QuizAnswers;
  const mergedAnswers: QuizAnswers = { ...currentAnswers, [field]: fieldValidation.value };

  const [previousTop] = await db
    .select({
      cardId: recommendations.cardId,
      explanation: recommendations.explanation,
      explanationSource: recommendations.explanationSource,
    })
    .from(recommendations)
    .where(and(eq(recommendations.userId, user.id), eq(recommendations.rank, 1)))
    .limit(1);

  const previousTopCard: PreviousTopCard | undefined = previousTop
    ? {
        cardId: previousTop.cardId,
        explanation: previousTop.explanation,
        // rank>1's 'template' source never applies to rank 1, but the
        // column is a plain text type — narrow defensively rather than
        // trusting the stored string matches the union.
        explanationSource:
          previousTop.explanationSource === "fallback_template"
            ? "fallback_template"
            : "gemini",
      }
    : undefined;

  // 2D: the write itself failing (not the re-score) is the case that must
  // never be silent — catch it specifically and leave everything else
  // (recommendations, prior answers) untouched.
  try {
    await db
      .update(userProfile)
      .set({ answers: mergedAnswers, updatedAt: new Date() })
      .where(eq(userProfile.userId, user.id));
  } catch {
    return NextResponse.json(
      { error: "Couldn't update your results — try again." },
      { status: 500 }
    );
  }

  const result = await computeAndPersistRecommendations(
    user.id,
    mergedAnswers,
    undefined,
    previousTopCard
  );

  return NextResponse.json(result);
}
