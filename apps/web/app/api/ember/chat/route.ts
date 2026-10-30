import { NextResponse } from "next/server";
import { and, asc, count, eq } from "drizzle-orm";
import { chatMessages, db } from "@perq/db";
import { chatRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logAgentRun } from "@/lib/ember/agentRunLog";
import { chatWithEmber, geminiCaller } from "@/lib/ember/recommender/run";
import { recommenderContext } from "@/lib/recommender/context";
import { sleep, sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const THREAD = "recommender";
const MAX_TURNS = 40; // per user per thread (Gemini free-tier guard, D9)
const HISTORY_TURNS = 12; // recent messages sent back to the model
const WORDS_PER_CHUNK = 3;

/** GET /api/ember/chat: this user's recommender thread. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, auth.id), eq(chatMessages.thread, THREAD)))
    .orderBy(asc(chatMessages.createdAt));
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/ember/chat (SSE): one turn. Context comes through Ember's tools
 * (profile, ranking, card details, compare, what-if), not pasted in full.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });

  const [turns] = await db
    .select({ n: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, auth.id), eq(chatMessages.thread, THREAD), eq(chatMessages.role, "user")));
  if ((turns?.n ?? 0) >= MAX_TURNS) {
    return NextResponse.json({ error: "This conversation is at its length limit." }, { status: 429 });
  }
  const ctx = await recommenderContext(auth.id);
  if (!ctx) return NextResponse.json({ error: "Take the quiz first." }, { status: 404 });

  const history = (
    await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, auth.id), eq(chatMessages.thread, THREAD)))
      .orderBy(asc(chatMessages.createdAt))
  )
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));

  return sseResponse(async (emit) => {
    const answer = await chatWithEmber({
      userId: auth.id,
      answers: ctx.answers,
      result: ctx.result,
      catalogue: ctx.catalogue,
      heldCardIds: ctx.heldCardIds,
      callModel: geminiCaller(),
      message: body.data.message,
      history,
      onLabel: (label) => emit({ type: "step", label }),
      logRun: logAgentRun,
    });
    await db.insert(chatMessages).values([
      { userId: auth.id, thread: THREAD, role: "user", content: body.data.message },
      { userId: auth.id, thread: THREAD, role: "assistant", content: answer.text },
    ]);
    // Gemini's tool loop isn't token-streamed, so the finished reply is
    // re-emitted in small chunks to read like a live reply.
    const words = answer.text.split(" ");
    for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
      const last = i + WORDS_PER_CHUNK >= words.length;
      emit({ type: "chunk", text: words.slice(i, i + WORDS_PER_CHUNK).join(" ") + (last ? "" : " ") });
      if (!last) await sleep(30);
    }
    emit({ type: "done" });
  });
}
