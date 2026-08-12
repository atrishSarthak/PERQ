import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
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

  const activeCards = await db
    .select({ id: cards.id, name: cards.name, issuer: cards.issuer })
    .from(cards)
    .where(eq(cards.status, "active"));

  const cardOptions = activeCards.map((c) => ({
    value: c.id,
    label: `${c.issuer} ${c.name}`,
  }));

  return <QuizWizard cardOptions={cardOptions} />;
}
