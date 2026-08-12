import { NextResponse } from "next/server";
import { and, asc, count, eq } from "drizzle-orm";
import { db, cards, chatMessages, type Card as DbCard } from "@perq/db";
import { runGeminiAgent, createGeminiModelCaller } from "@perq/ai";
import { requireAuth, isAuthed } from "@/lib/auth";
import { chatMessageSchema } from "@/lib/mimir/chatMessageSchema";
import { buildGroundingContext } from "@/lib/mimir/chatContext";
import { buildChatSystemPrompt } from "@/lib/mimir/prompt";
import { createGetCardDetailsTool } from "@/lib/mimir/tools";

// D9: per-user turn cap — the larger, previously-unbounded Gemini-quota
// risk identified in the outside-voice review (unlike quiz-submit, chat
// has no D6/D10 cache and calls Gemini fresh every turn).
const MAX_CHAT_TURNS = 20;

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (!isAuthed(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { message } = parsed.data;

  // A turn is one user message (+ its assistant reply) — count only
  // user-role rows, not all rows, or the real cap would be MAX_CHAT_TURNS/2.
  const [turnCountRow] = await db
    .select({ value: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, user.id), eq(chatMessages.role, "user")));
  const turnCount = turnCountRow?.value ?? 0;

  if (turnCount >= MAX_CHAT_TURNS) {
    return NextResponse.json(
      {
        error:
          "This conversation has reached its length limit — start a fresh question from your results page.",
      },
      { status: 429 }
    );
  }

  const groundingContext = await buildGroundingContext(user.id);
  if (!groundingContext) {
    return NextResponse.json(
      { error: "No profile found — complete the quiz first." },
      { status: 404 }
    );
  }

  const priorMessages = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.userId, user.id))
    .orderBy(asc(chatMessages.createdAt));

  const activeCards = await db.select().from(cards).where(eq(cards.status, "active"));
  const dbCardsById = new Map<string, DbCard>(activeCards.map((c) => [c.id, c]));

  const history = [
    ...priorMessages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  let agentResult;
  try {
    agentResult = await runGeminiAgent({
      systemPrompt: buildChatSystemPrompt(groundingContext),
      history,
      tools: [createGetCardDetailsTool(dbCardsById)],
      callModel: createGeminiModelCaller(requireGeminiKey()),
    });
  } catch {
    // Post-outside-voice decision: explicit error, the failed turn is NOT
    // persisted (it would pollute D2's context reconstruction on retry),
    // user can just retry with the same message still in their input box.
    return NextResponse.json(
      { error: "MIMIR couldn't respond — try again." },
      { status: 502 }
    );
  }

  if (!agentResult.finalText || agentResult.cappedOut) {
    return NextResponse.json(
      { error: "MIMIR couldn't respond — try again." },
      { status: 502 }
    );
  }

  await db.insert(chatMessages).values([
    { userId: user.id, role: "user", content: message },
    { userId: user.id, role: "assistant", content: agentResult.finalText },
  ]);

  return NextResponse.json({ reply: agentResult.finalText });
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}
