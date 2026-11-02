import { NextResponse } from "next/server";
import { arsenalPatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { setHeld } from "@/lib/recommender/service";
import { addHeldCardAccount, removeHeldCardAccount } from "@/lib/money/heldCards";

export const dynamic = "force-dynamic";

/** PATCH /api/arsenal/:cardId { held }: the one held/not-held mutation. */
export async function PATCH(req: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { cardId } = await params;
  const body = arsenalPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Body must be { held: boolean }" }, { status: 400 });
  const card = (await loadCatalogue()).find((c) => c.id === cardId);
  if (!card) return NextResponse.json({ error: `No card with id ${cardId}` }, { status: 404 });
  await setHeld(auth.id, cardId, body.data.held);
  // The card joins (or leaves) My cards, so plans, Home and Ember use it.
  if (body.data.held) await addHeldCardAccount(auth.id, card);
  else await removeHeldCardAccount(auth.id, cardId);
  return NextResponse.json({ cardId, held: body.data.held });
}
