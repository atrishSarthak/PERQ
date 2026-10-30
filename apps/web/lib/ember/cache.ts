import { and, eq } from "drizzle-orm";
import { db, recommendations } from "@perq/db";

/**
 * D6/D10 cache lookup: an existing rank-1 recommendation for this exact
 * (user, profile_hash, cards_version) combination means an identical
 * profile against unchanged card data — reuse its explanation instead of
 * calling Gemini again.
 */
export async function findCachedTopExplanation(
  userId: string,
  profileHash: string,
  cardsVersion: string
): Promise<{ explanation: string; cardId: string } | null> {
  const [existing] = await db
    .select({
      explanation: recommendations.explanation,
      cardId: recommendations.cardId,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.profileHash, profileHash),
        eq(recommendations.cardsVersion, cardsVersion),
        eq(recommendations.rank, 1)
      )
    )
    .limit(1);

  return existing ?? null;
}
