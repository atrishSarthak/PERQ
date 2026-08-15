import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, cards, userProfile } from "@perq/db";
import { QuizWizard } from "./QuizWizard";

export default async function QuizPage() {
  // Auth is enforced by the (shell) layout — this page only needs the
  // session for its own data queries, not to gate access.
  const session = await auth();
  const userId = session!.user.id;

  // §11: a returning user with a saved profile skips the quiz entirely.
  const [profile] = await db
    .select({ id: userProfile.id })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  if (profile) {
    redirect("/results");
  }

  // Scoped to the seeded catalog specifically — without this, the query
  // pulls in every web_search-origin card from every profile-shape bucket
  // ever generated (D15), which only grows over time and mixes other
  // users' bucket results into Q1's card picker for no reason. The seeded
  // set is exactly what a brand-new user (no profile yet) should be
  // searching against.
  const activeCards = await db
    .select({ id: cards.id, name: cards.name, issuer: cards.issuer, network: cards.network })
    .from(cards)
    .where(and(eq(cards.origin, "seeded"), eq(cards.status, "active")));

  const cardOptions = activeCards.map((c) => ({
    value: c.id,
    label: `${c.issuer} ${c.name}`,
    name: c.name,
    issuer: c.issuer,
    network: c.network,
  }));

  return <QuizWizard cardOptions={cardOptions} />;
}
