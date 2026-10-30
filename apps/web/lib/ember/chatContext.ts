import { asc, eq } from "drizzle-orm";
import { db, recommendations, userProfile } from "@perq/db";

/**
 * D2/D11: reconstructs the full grounding context fresh from Postgres on
 * every chat request — the user's quiz answers and their LATEST
 * recommendations (not a snapshot frozen to when the conversation
 * started; a profile edit mid-conversation is reflected here
 * automatically since this always reads current state).
 */
export async function buildGroundingContext(userId: string): Promise<string | null> {
  const [profile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  if (!profile) return null;

  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.userId, userId))
    .orderBy(asc(recommendations.rank));

  const recSummary = recs
    .map((r) => `#${r.rank} ${r.cardId}: ${r.explanation}`)
    .join("\n");

  return `Quiz answers: ${JSON.stringify(profile.answers)}

Current recommendations (ranked):
${recSummary || "(none yet)"}`;
}
