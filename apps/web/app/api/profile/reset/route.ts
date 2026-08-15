import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, recommendations, userProfile } from "@perq/db";
import { requireAuth, isAuthed } from "@/lib/auth";

/**
 * POST /api/profile/reset — Task 2's "Retake the Quiz". Clears the user's
 * quiz-derived state (user_profile.answers and every computed
 * recommendation) so the quiz modal can start fresh at question 1, exactly
 * like a brand-new user. Deliberately does NOT touch user_card_arsenal —
 * that's manually curated "cards I actually hold" data, distinct from the
 * quiz-derived spend profile, and the spec is explicit this action must
 * never silently wipe it.
 */
export async function POST() {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  await db.delete(recommendations).where(eq(recommendations.userId, user.id));
  await db.delete(userProfile).where(eq(userProfile.userId, user.id));

  return NextResponse.json({ ok: true });
}
