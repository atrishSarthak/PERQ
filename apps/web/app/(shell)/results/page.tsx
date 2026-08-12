import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, recommendations, userCardArsenal, userProfile } from "@perq/db";
import type { QuizAnswers } from "@perq/scoring-engine";
import type { ResultsCard } from "./types";
import { ResultsView } from "./ResultsView";

/**
 * Perf-A: two queries total (active cards, user's recommendations — plus
 * arsenal state), merged and returned to the client once. Filters and sort
 * tabs then operate entirely in-memory client-side (§10: "these re-sort
 * the same result set; they aren't separate queries") — never re-queried.
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

  const [activeCards, recs, arsenalRows] = await Promise.all([
    db.select().from(cards).where(eq(cards.status, "active")),
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
      recommendation: rec
        ? { rank: rec.rank, score: Number(rec.score), explanation: rec.explanation }
        : undefined,
      arsenalStatus: (arsenalByCardId.get(c.id) as "held" | "not_held" | undefined) ?? undefined,
    };
  });

  return <ResultsView cards={resultsCards} answers={profile.answers as QuizAnswers} />;
}
