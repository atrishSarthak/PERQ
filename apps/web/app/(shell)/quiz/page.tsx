import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile } from "@/lib/recommender/service";
import { QuizV2Client } from "./QuizV2Client";

// Quiz v2 for signed-in web users (handoff §1.7). A returning user goes to
// their results unless they asked to retake.
export default async function QuizPage({ searchParams }: { searchParams: Promise<{ retake?: string }> }) {
  const session = await auth();
  const userId = session!.user.id;
  const { retake } = await searchParams;
  const profile = await getProfile(userId);
  if (profile && !retake) redirect("/results");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <QuizV2Client initial={profile?.answers} />
    </main>
  );
}
