import { NextResponse } from "next/server";
import { loadCatalogue } from "@/lib/recommender/catalog";

export const dynamic = "force-dynamic";

/** GET /api/cards: the catalogue for the quiz's card picker (public). */
export async function GET() {
  const cards = (await loadCatalogue()).map((c) => ({
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    networks: c.networks,
    verified: c.verified,
  }));
  return NextResponse.json({ cards });
}
