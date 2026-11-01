import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/money/activity";
import { computeResults } from "@/lib/recommender/service";
import { setSpendSource } from "@/lib/recommender/spendSync";

export const dynamic = "force-dynamic";

const body = z.object({ source: z.enum(["statements", "quiz"]) });

/** POST /api/recommender/sync-spend (§9): use real statement spend, or go back to quiz answers. Returns fresh results. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "source must be statements or quiz" }, { status: 400 });
  const r = await setSpendSource(auth.id, b.data.source);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 409 });
  await logActivity(auth.id, "spend_synced", b.data.source === "statements" ? "Switched your card ranking to your real spending" : "Switched your card ranking back to quiz answers");
  const computed = await computeResults(auth.id);
  return computed ? NextResponse.json(computed.response) : NextResponse.json({ error: "Take the quiz first." }, { status: 404 });
}
