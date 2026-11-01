import { NextResponse } from "next/server";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { chatMessages, db, nudges } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logAgentRun } from "@/lib/ember/agentRunLog";
import { moneyContext } from "@/lib/ember/money/context";
import { NUDGE_CHIPS, nudgeOpening } from "@/lib/ember/money/nudgeThread";
import { chatTurn } from "@/lib/ember/money/run";
import type { MoneyProposal } from "@/lib/ember/money/tools";
import { formatInr } from "@perq/finance-engine";
import { chatRequestSchema, threadRefSchema, TXN_CATEGORY_LABELS, type TxnCategory } from "@perq/shared";
import { geminiCaller } from "@/lib/ember/recommender/run";
import { nowFor } from "@/lib/money/clock";
import { recommenderContext } from "@/lib/recommender/context";
import { sleep, sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The main Ember thread is `thread = "recommender"` with no thread_ref (Step 1
// history stays where it was). Nudge and card threads use thread "money" plus
// thread_ref `nudge:<id>` / `card:<id>` (AUDIT Step 2 #5).
const MAIN_THREAD = "recommender";
const REF_THREAD = "money";
const MAX_TURNS = 40; // per user per thread (Gemini free-tier guard, D9)
const HISTORY_TURNS = 12; // recent messages sent back to the model
const WORDS_PER_CHUNK = 3;

const threadWhere = (userId: string, threadRef: string | null) =>
  threadRef
    ? and(eq(chatMessages.userId, userId), eq(chatMessages.threadRef, threadRef))
    : and(eq(chatMessages.userId, userId), eq(chatMessages.thread, MAIN_THREAD), isNull(chatMessages.threadRef));

async function nudgeFor(userId: string, threadRef: string | null) {
  if (!threadRef?.startsWith("nudge:")) return null;
  const [row] = await db.select().from(nudges).where(and(eq(nudges.id, threadRef.slice(6)), eq(nudges.userId, userId))).limit(1);
  return row ?? null;
}

/** GET /api/ember/chat?threadRef=: a thread's messages. A nudge thread starts with Ember restating the nudge. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const raw = new URL(req.url).searchParams.get("threadRef");
  const ref = raw ? threadRefSchema.safeParse(raw) : null;
  if (ref && !ref.success) return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  const threadRef = ref?.data ?? null;
  const nudge = await nudgeFor(auth.id, threadRef);
  if (threadRef?.startsWith("nudge:") && !nudge) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let rows = await db.select().from(chatMessages).where(threadWhere(auth.id, threadRef)).orderBy(asc(chatMessages.createdAt));
  if (nudge && rows.length === 0) {
    rows = await db
      .insert(chatMessages)
      .values({ userId: auth.id, thread: REF_THREAD, threadRef, role: "assistant", content: nudgeOpening(nudge) })
      .returning();
  }
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    ...(nudge
      ? {
          chips: NUDGE_CHIPS[nudge.ruleId] ?? [],
          nudge: { id: nudge.id, ruleId: nudge.ruleId, title: nudge.title, cardAccountId: nudge.cardAccountId, status: nudge.status },
        }
      : {}),
  });
}

/**
 * POST /api/ember/chat (SSE): one turn. Context comes through Ember's tools
 * (recommender after the quiz, Money Manager after a statement), not pasted in full.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  const threadRef = body.data.threadRef ?? null;

  const [turns] = await db
    .select({ n: count() })
    .from(chatMessages)
    .where(and(threadWhere(auth.id, threadRef), eq(chatMessages.role, "user")));
  if ((turns?.n ?? 0) >= MAX_TURNS) {
    return NextResponse.json({ error: "This conversation is at its length limit." }, { status: 429 });
  }
  const now = await nowFor(auth.id);
  const [rec, money, nudgeRow] = await Promise.all([recommenderContext(auth.id), moneyContext(auth.id, now), nudgeFor(auth.id, threadRef)]);
  if (!rec && !money) return NextResponse.json({ error: "Take the quiz or upload a statement first." }, { status: 404 });
  if (threadRef?.startsWith("nudge:") && !nudgeRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nudge = nudgeRow ? money?.nudges.find((n) => n.id === nudgeRow.id) ?? null : null;
  const cardState = threadRef?.startsWith("card:") ? money?.state.cards.find((c) => c.cardAccountId === threadRef.slice(5)) : undefined;
  if (threadRef?.startsWith("card:") && !cardState) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const card = cardState ? { cardAccountId: cardState.cardAccountId, label: cardState.label } : null;

  const history = (await db.select({ role: chatMessages.role, content: chatMessages.content }).from(chatMessages).where(threadWhere(auth.id, threadRef)).orderBy(asc(chatMessages.createdAt)))
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));

  return sseResponse(async (emit) => {
    let proposal: MoneyProposal | null = null;
    const answer = await chatTurn({
      userId: auth.id,
      message: body.data.message,
      history,
      recommender: rec ? { answers: rec.answers, result: rec.result, catalogue: rec.catalogue, heldCardIds: rec.heldCardIds } : null,
      money,
      nudge,
      card,
      callModel: geminiCaller(),
      onLabel: (label) => emit({ type: "step", label }),
      onProposal: (p) => {
        proposal = p;
        emit({ type: "proposal", proposal: p });
      },
      logRun: logAgentRun,
    });
    const thread = threadRef ? REF_THREAD : MAIN_THREAD;
    await db.insert(chatMessages).values([
      { userId: auth.id, thread, threadRef, role: "user", content: body.data.message },
      // The proposal is stored with the reply so later turns (and history) know exactly what was offered.
      { userId: auth.id, thread, threadRef, role: "assistant", content: proposal ? `${answer.text}\n\n${proposalLine(proposal)}` : answer.text },
    ]);
    // Replying in a nudge thread counts as acting on it (§7.4).
    if (nudgeRow && nudgeRow.status !== "acted") {
      await db.update(nudges).set({ status: "acted", actedAt: new Date(), openedAt: nudgeRow.openedAt ?? new Date() }).where(eq(nudges.id, nudgeRow.id));
    }
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

function proposalLine(p: MoneyProposal): string {
  if (p.kind === "goal") return `(Proposed goal: ${p.name}, ${formatInr(p.target)}${p.date ? ` by ${p.date}` : ""}. Not saved until confirmed.)`;
  const cats = Object.entries(p.categories).map(([c, v]) => `${TXN_CATEGORY_LABELS[c as TxnCategory] ?? c} ${formatInr(v)}`);
  return `(Proposed budget: ${p.total ? `total ${formatInr(p.total)}; ` : ""}${cats.join(", ")}. Not saved until confirmed.)`;
}
