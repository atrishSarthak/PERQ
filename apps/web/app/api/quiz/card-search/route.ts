import { NextResponse } from "next/server";
import { z } from "zod";
import { searchGroundedText, extractStructuredJson, type ResponseSchema } from "@perq/ai";
import { requireAuth, isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ query: z.string().min(1).max(120) });

const CARD_LOOKUP_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    issuer: { type: "string" },
    network: { type: "string" },
  },
  required: ["name", "issuer", "network"],
};

const resultSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  network: z.string().min(1),
});

/**
 * Q1's CARD SEARCH web-fallback: when the local ~100-120 card database has
 * no match for what the user typed, look the card up on the web and offer
 * it as a selectable "add anyway" option. Deliberately lighter-weight than
 * D15's bucket card search (packages lib/mimir/cardSearch.ts) — that path
 * extracts full reward-rate/fee data for scoring an entire card set; this
 * one just needs enough to render a mini card visual and store an ad-hoc
 * held-card reference. A card found this way never gets reward-rate data,
 * which is exactly why the UI must label it "limited data" (Task spec).
 */
export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ card: null });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { text } = await searchGroundedText(
      apiKey,
      `Find one real, currently-marketed Indian credit card matching "${parsed.data.query}". Report its exact issuer bank, full card name, and card network (Visa, Mastercard, RuPay, or Amex).`
    );
    if (!text) {
      return NextResponse.json({ card: null });
    }

    const raw = await extractStructuredJson(
      apiKey,
      `From these research notes, extract the one card's name, issuer, and network as JSON. If no real card is described, return {"name":"","issuer":"","network":""}.\n\n${text}`,
      CARD_LOOKUP_SCHEMA
    );

    const result = resultSchema.safeParse(raw);
    if (!result.success || !result.data.name || !result.data.issuer) {
      return NextResponse.json({ card: null });
    }

    const id = `websearch:${result.data.issuer}:${result.data.name}`
      .toLowerCase()
      .replace(/\s+/g, "-");

    return NextResponse.json({
      card: { id, name: result.data.name, issuer: result.data.issuer, network: result.data.network },
    });
  } catch {
    // A lookup failure just means no fallback result — never block the quiz.
    return NextResponse.json({ card: null });
  }
}
