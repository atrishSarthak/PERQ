import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, cards, userCardArsenal } from "@perq/db";
import { requireAuth, isAuthed } from "@/lib/auth";
import { arsenalToggleSchema } from "@/lib/mimir/arsenalSchema";

/**
 * POST /api/arsenal/toggle — PRD §12: one mutation, two entry points (quiz
 * Q1's "which cards do you hold" and the results-page toggle button).
 * Single atomic upsert on the (user_id, card_id) unique index already in
 * the schema — no select-then-branch race window.
 */
export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  const parsed = arsenalToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { cardId, status } = parsed.data;

  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  if (!card) {
    return NextResponse.json({ error: `No card found for id ${cardId}` }, { status: 404 });
  }

  await db
    .insert(userCardArsenal)
    .values({ userId: user.id, cardId, status })
    .onConflictDoUpdate({
      target: [userCardArsenal.userId, userCardArsenal.cardId],
      set: { status, updatedAt: new Date() },
    });

  return NextResponse.json({ cardId, status });
}
