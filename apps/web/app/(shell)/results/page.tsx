import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, recommendations, userCardArsenal, userProfile } from "@perq/db";
import type { QuizAnswers } from "@perq/scoring-engine";
import type { ResultsCard } from "./types";
import { ResultsView } from "./ResultsView";
import { firstNameFrom } from "./cardHolderName";

/**
 * Perf-A: two queries total (active cards, user's recommendations — plus
 * arsenal state), merged and returned to the client once. Filters and sort
 * tabs then operate entirely in-memory client-side (§10: "these re-sort
 * the same result set; they aren't separate queries") — never re-queried.
 *
 * D15: "active cards" is no longer literally every active row in the whole
 * table — with web-search results partitioned by searchBucketKey and shared
 * across users, that would mix in every other bucket's cards too. Instead
 * this scopes to exactly the set userProfile.lastCardSourceMode/
 * lastSearchBucketKey says this user's latest recommendation compute
 * actually used (set by computeAndPersistRecommendations/resolveCardSet).
 */
export default async function ResultsPage() {
  // Auth is enforced by the (shell) layout — this page only needs the
  // session for its own data queries, not to gate access.
  const session = await auth();
  const userId = session!.user.id;

  const [profile] = await db
    .select({
      id: userProfile.id,
      answers: userProfile.answers,
      lastCardSourceMode: userProfile.lastCardSourceMode,
      lastSearchBucketKey: userProfile.lastSearchBucketKey,
    })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  // §11: a returning user with a saved profile skips the quiz; no profile
  // yet means they haven't completed onboarding.
  if (!profile) {
    redirect("/quiz");
  }

  const cardSetCondition =
    profile.lastCardSourceMode === "web_search" && profile.lastSearchBucketKey
      ? and(
          eq(cards.origin, "web_search"),
          eq(cards.searchBucketKey, profile.lastSearchBucketKey),
          eq(cards.status, "active")
        )
      : and(eq(cards.origin, "seeded"), eq(cards.status, "active"));

  const [activeCards, recs, arsenalRows] = await Promise.all([
    db.select().from(cards).where(cardSetCondition),
    db.select().from(recommendations).where(eq(recommendations.userId, userId)),
    db.select().from(userCardArsenal).where(eq(userCardArsenal.userId, userId)),
  ]);

  const recsByCardId = new Map(recs.map((r) => [r.cardId, r]));
  const arsenalByCardId = new Map(arsenalRows.map((a) => [a.cardId, a.status]));

  const resultsCards: ResultsCard[] = activeCards.map((c) => {
    const rec = recsByCardId.get(c.id);
    return {
      cardId: c.id,
      name: c.name,
      issuer: c.issuer,
      network: c.network,
      annualFee: Number(c.annualFee),
      joiningFee: Number(c.joiningFee),
      rewardRates: (c.rewardRates ?? {}) as Record<string, number>,
      loungeAccess: c.loungeAccess,
      feeWaiverCondition: c.feeWaiverCondition,
      recommendation: rec
        ? { rank: rec.rank, score: Number(rec.score), explanation: rec.explanation }
        : undefined,
      arsenalStatus: (arsenalByCardId.get(c.id) as "held" | "not_held" | undefined) ?? undefined,
      sourceUrls: c.sourceUrls as string[] | null,
    };
  });

  const cardHolderName = firstNameFrom(session!.user.name, session!.user.email);

  return (
    <ResultsView
      cards={resultsCards}
      answers={profile.answers as QuizAnswers}
      cardHolderName={cardHolderName}
    />
  );
}
