import { NextResponse } from "next/server";
import { recommend } from "@perq/scoring-engine";
import { quizAnswersV2Schema } from "@perq/shared";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { allowRequest, clientIp } from "@/lib/rateLimitIp";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommender/public: scores quiz answers without saving
 * anything (landing-page card finder, handoff §1.7). No login; rate-limited
 * per IP. Pure computation, no Gemini call.
 */
export async function POST(req: Request) {
  if (!allowRequest(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = quizAnswersV2Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers", issues: parsed.error.issues }, { status: 400 });
  }
  const result = recommend(parsed.data, await loadCatalogue());
  return NextResponse.json({ result });
}
