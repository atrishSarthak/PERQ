import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { getCart } from "@/lib/swiggy/service";

export const dynamic = "force-dynamic";

/** GET /api/swiggy/carts/:id: a prepared cart, for its card in chat. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const cart = await getCart(auth.id, (await params).id);
  if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ cart });
}
