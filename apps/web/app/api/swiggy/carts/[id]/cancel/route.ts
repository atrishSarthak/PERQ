import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { cancelCart } from "@/lib/swiggy/service";

export const dynamic = "force-dynamic";

/** POST /api/swiggy/carts/:id/cancel: drop a prepared cart. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const cart = await cancelCart(auth.id, (await params).id);
  if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ cart });
}
