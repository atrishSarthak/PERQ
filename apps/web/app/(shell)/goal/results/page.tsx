import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, goalRecommendations, goals } from "@perq/db";
import { GoalResultsView } from "./GoalResultsView";

/**
 * No persistent goal history/dashboard — this reads only the single MOST
 * RECENT goal_recommendations row for the user (the result of whatever
 * search they just completed), not a browsable list. A user who navigates
 * here directly without ever searching, or whose latest search ended in a
 * non-success outcome (nothing written, per the total-failure/
 * no_listings_found/unsupported/needs_clarification paths), has nothing to
 * show here and is sent back to /goal.
 */
export default async function GoalResultsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [latest] = await db
    .select({
      id: goalRecommendations.id,
      goalText: goals.goalText,
      recommendedChannel: goalRecommendations.recommendedChannel,
      recommendedSourceUrl: goalRecommendations.recommendedSourceUrl,
      recommendedCardId: goalRecommendations.recommendedCardId,
      paymentMethod: goalRecommendations.paymentMethod,
      bnplNote: goalRecommendations.bnplNote,
      cardOfferNote: goalRecommendations.cardOfferNote,
      cardOfferCitationUrl: goalRecommendations.cardOfferCitationUrl,
      billingCycleNote: goalRecommendations.billingCycleNote,
      explanation: goalRecommendations.explanation,
      channelsChecked: goalRecommendations.channelsChecked,
      cardName: cards.name,
      cardIssuer: cards.issuer,
    })
    .from(goalRecommendations)
    .innerJoin(goals, eq(goals.id, goalRecommendations.goalId))
    .leftJoin(cards, eq(cards.id, goalRecommendations.recommendedCardId))
    .where(eq(goalRecommendations.userId, userId))
    .orderBy(desc(goalRecommendations.createdAt))
    .limit(1);

  if (!latest) {
    redirect("/goal");
  }

  return (
    <GoalResultsView
      goalText={latest.goalText}
      recommendedChannel={latest.recommendedChannel}
      recommendedSourceUrl={latest.recommendedSourceUrl}
      cardName={latest.cardName ? `${latest.cardIssuer} ${latest.cardName}` : null}
      paymentMethod={latest.paymentMethod}
      bnplNote={latest.bnplNote}
      billingCycleNote={latest.billingCycleNote}
      cardOfferNote={latest.cardOfferNote}
      cardOfferCitationUrl={latest.cardOfferCitationUrl}
      explanation={latest.explanation}
      channelsChecked={
        latest.channelsChecked as { source: string; sourceUrl: string; outcome: string; price?: number }[]
      }
    />
  );
}
