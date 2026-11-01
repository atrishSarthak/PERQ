import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { getFinancialState } from "@/lib/money/state";

export const dynamic = "force-dynamic";

/** GET /api/card-accounts: My cards (due, utilisation, points) from the financial state. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const state = await getFinancialState(auth.id, await nowFor(auth.id));
  return NextResponse.json({ cards: state.cards, dataThrough: state.dataThrough });
}
