import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, recommendations, userCardArsenal, userProfile } from "@perq/db";
import { HomeDashboard } from "./HomeDashboard";
import type { TopPickData } from "./CardRecommenderWidget";
import type { ArsenalCardData } from "./CardArsenalWidget";
import type { CardOption } from "../quiz/QuizWizard";
import { firstNameFrom } from "../results/cardHolderName";

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

  // These two don't depend on each other, only on userId — running them
  // sequentially (as this page used to) means the page-transition overlay
  // (which can't shrink away until this Server Component actually finishes
  // rendering) sits fully opaque for the SUM of every round trip. In
  // parallel, it's bounded by the slowest one instead — this is why
  // navigating back to /home specifically felt "stuck" longer than other
  // pages: results/page.tsx already parallelizes its two queries, this one
  // didn't.
  const [[profile], arsenalCards] = await Promise.all([
    db.select({ id: userProfile.id }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1),
    db
      .select({
        cardId: userCardArsenal.cardId,
        name: cards.name,
        issuer: cards.issuer,
        network: cards.network,
      })
      .from(userCardArsenal)
      .innerJoin(cards, eq(cards.id, userCardArsenal.cardId))
      .where(and(eq(userCardArsenal.userId, userId), eq(userCardArsenal.status, "held"))),
  ]);

  let topPick: TopPickData | null = null;
  let cardOptions: CardOption[] = [];

  // This one genuinely depends on `profile` (which branch to take), so it
  // can't join the batch above — but it's the only remaining sequential
  // step now, not one of four.
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

  const name = firstNameFrom(session!.user.name, session!.user.email);
  const dateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <HomeDashboard
      greeting={greetingFor(name)}
      dateString={dateString}
      quizTaken={Boolean(profile)}
      topPick={topPick}
      arsenalCards={arsenalCards}
      cardOptions={cardOptions}
    />
  );
}
