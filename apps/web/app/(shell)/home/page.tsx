import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, recommendations, userCardArsenal, userProfile } from "@perq/db";
import { HomeDashboard } from "./HomeDashboard";
import type { TopPickData } from "./CardRecommenderWidget";
import type { ArsenalCardData } from "./CardArsenalWidget";
import type { CardOption } from "../quiz/QuizWizard";
import { firstNameFrom } from "../results/cardHolderName";
import { hasReachedDailyGoalSearchLimit, MAX_GOAL_SEARCHES_PER_DAY } from "@/lib/goals/rateLimit";

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${period}, ${name}`;
}

/**
 * The dashboard's data needs, in one page: does the user have a profile
 * (quiz taken), their #1 recommendation if so (Card Recommender widget),
 * and their held arsenal cards (Card Arsenal widget). cardOptions (the
 * seeded card catalog for Q1's search) is only fetched when there's no
 * profile yet — it's only needed to open the quiz modal from the
 * "not taken" state.
 */
export default async function HomePage() {
  // Auth is enforced by the (shell) layout — this page only needs the
  // session for its own data queries, not to gate access.
  const session = await auth();
  const userId = session!.user.id;

  const [profile] = await db
    .select({ id: userProfile.id })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  let topPick: TopPickData | null = null;
  let cardOptions: CardOption[] = [];

  if (profile) {
    const [topRec] = await db
      .select({
        cardId: recommendations.cardId,
        explanation: recommendations.explanation,
        name: cards.name,
        issuer: cards.issuer,
        network: cards.network,
      })
      .from(recommendations)
      .innerJoin(cards, eq(cards.id, recommendations.cardId))
      .where(and(eq(recommendations.userId, userId), eq(recommendations.rank, 1)))
      .limit(1);

    topPick = topRec ?? null;
  } else {
    const seededCards = await db
      .select({ id: cards.id, name: cards.name, issuer: cards.issuer, network: cards.network })
      .from(cards)
      .where(and(eq(cards.origin, "seeded"), eq(cards.status, "active")));

    cardOptions = seededCards.map((c) => ({
      value: c.id,
      label: `${c.issuer} ${c.name}`,
      name: c.name,
      issuer: c.issuer,
      network: c.network,
    }));
  }

  const arsenalCards: ArsenalCardData[] = await db
    .select({
      cardId: userCardArsenal.cardId,
      name: cards.name,
      issuer: cards.issuer,
      network: cards.network,
    })
    .from(userCardArsenal)
    .innerJoin(cards, eq(cards.id, userCardArsenal.cardId))
    .where(and(eq(userCardArsenal.userId, userId), eq(userCardArsenal.status, "held")));

  const name = firstNameFrom(session!.user.name, session!.user.email);
  const dateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const atGoalSearchDailyLimit = await hasReachedDailyGoalSearchLimit(userId);

  return (
    <HomeDashboard
      greeting={greetingFor(name)}
      dateString={dateString}
      quizTaken={Boolean(profile)}
      topPick={topPick}
      arsenalCards={arsenalCards}
      cardOptions={cardOptions}
      atGoalSearchDailyLimit={atGoalSearchDailyLimit}
      goalSearchDailyLimit={MAX_GOAL_SEARCHES_PER_DAY}
    />
  );
}
