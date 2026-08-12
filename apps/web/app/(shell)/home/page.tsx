import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, userProfile } from "@perq/db";

export default async function HomePage() {
  const session = await auth();
  const userId = session!.user.id;

  const [profile] = await db
    .select({ id: userProfile.id })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-display text-h1 text-text-primary">
        {profile ? "Welcome back" : "Welcome to MIMIR"}
      </h1>
      <p className="max-w-md text-center font-body text-body text-text-secondary">
        {profile
          ? "Pick up right where you left off — open Card Recommender from the sidebar to see your latest recommendations."
          : "Pick a feature from the sidebar to get started. Card Recommender is ready — it's a quick quiz, then MIMIR ranks the right card for you."}
      </p>
      <a
        href="/quiz"
        className="rounded-md bg-accent px-4 py-2 font-body text-body text-white"
      >
        {profile ? "View my recommendations" : "Start the quiz"}
      </a>
    </main>
  );
}
