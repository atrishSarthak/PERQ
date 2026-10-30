import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeResults } from "@/lib/recommender/service";
import { ResultsV2Client } from "./ResultsV2Client";

// Signed-in results on the web, now on Card Recommender v2 (handoff §1.7).
export default async function ResultsPage() {
  const session = await auth();
  const computed = await computeResults(session!.user.id);
  if (!computed) redirect("/quiz");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <ResultsV2Client initial={computed.response} />
    </main>
  );
}
