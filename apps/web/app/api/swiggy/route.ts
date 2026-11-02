import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { connectSwiggy, disconnectSwiggy, swiggyStatus } from "@/lib/swiggy/service";

export const dynamic = "force-dynamic";

/** GET /api/swiggy: connected or not, and the mode (mock = demo data). */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  return NextResponse.json(await swiggyStatus(auth.id));
}

/** POST /api/swiggy: connect (SWIGGY_MODE, mock by default) and sync orders. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  try {
    return NextResponse.json(await connectSwiggy(auth.id, await nowFor(auth.id)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't connect Swiggy." }, { status: 400 });
  }
}

/** DELETE /api/swiggy: disconnect and delete the synced orders and carts. */
export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  await disconnectSwiggy(auth.id);
  return NextResponse.json(await swiggyStatus(auth.id));
}
