import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, recommendations, userCardArsenal, userProfile } from "@perq/db";
import type { QuizAnswers } from "@perq/scoring-engine";
import type { ResultsCard } from "./types";
import { ResultsView } from "./ResultsView";
import { firstNameFrom } from "./cardHolderName";

/**
 * MIMIR only ever recommends its actual top picks (computeAndPersistRecommendations
 * caps this at MAX_RECOMMENDATIONS — currently 20), not every card in
 * whatever source set was scored against, which can now run into the
 * hundreds (D15 + the expanded seeded catalog). So this page fetches the
 * user's recommendations first, then looks up only those cards by id —
 * never "every active row in the resolved set." Filters and sort tabs
 * still operate entirely in-memory client-side afterward (§10) — never
 * re-queried.
 */
export default async function ResultsPage() {
  // Auth is enforced by the (shell) layout — this page only needs the
  // session for its own data queries, not to gate access.
  const session = await auth();
  const userId = session!.user.id;

  const [profile] = await db
    .select({ id: userProfile.id, answers: userProfile.answers })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  // §11: a returning user with a saved profile skips the quiz; no profile
  // yet means they haven't completed onboarding.
  if (!profile) {
    redirect("/quiz");
  }

  const [recs, arsenalRows] = await Promise.all([
    db.select().from(recommendations).where(eq(recommendations.userId, userId)),
    db.select().from(userCardArsenal).where(eq(userCardArsenal.userId, userId)),
  ]);

  const cardIds = recs.map((r) => r.cardId);
  const activeCards = cardIds.length > 0 ? await db.select().from(cards).where(inArray(cards.id, cardIds)) : [];

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
