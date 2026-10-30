import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { computeResults } from "@/lib/recommender/service";

export const dynamic = "force-dynamic";

/** GET /api/recommender/results: ranked cards + leakage for the signed-in user. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const computed = await computeResults(auth.id);
  if (!computed) return NextResponse.json({ error: "No profile yet. Take the quiz first." }, { status: 404 });
  return NextResponse.json(computed.response);
}
