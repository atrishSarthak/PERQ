import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { getFinancialState } from "@/lib/money/state";
import { nowFor } from "@/lib/money/clock";

export const dynamic = "force-dynamic";

/** GET /api/state: the user's financial state (cached per day). */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  return NextResponse.json({ state: await getFinancialState(auth.id, await nowFor(auth.id)) });
}
