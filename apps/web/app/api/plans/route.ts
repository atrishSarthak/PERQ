import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { listPlans, toSummary } from "@/lib/plans/service";

export const dynamic = "force-dynamic";

/** GET /api/plans (Step 3 §9): the user's plan history, newest first. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  return NextResponse.json({ plans: (await listPlans(auth.id)).map(toSummary) });
}
