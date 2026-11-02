import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { placeSwiggyOrder, SwiggyOrderRefused } from "@/lib/swiggy/service";

export const dynamic = "force-dynamic";

// The Confirm button's request must say so explicitly.
const bodySchema = z.object({ confirm: z.literal(true) });

/** POST /api/swiggy/carts/:id/checkout: place the order, only from the user's Confirm tap. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  try {
    const cart = await placeSwiggyOrder(auth.id, (await params).id, { confirmedByUser: body.success, now: await nowFor(auth.id) });
    return NextResponse.json({ cart });
  } catch (err) {
    if (err instanceof SwiggyOrderRefused) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
