import { NextResponse } from "next/server";
import { and, asc, count, eq } from "drizzle-orm";
import { db, cards, chatMessages, type Card as DbCard } from "@perq/db";
import { runGeminiAgent, createGeminiModelCaller } from "@perq/ai";
import { requireAuth, isAuthed } from "@/lib/auth";
import { chatMessageSchema } from "@/lib/mimir/chatMessageSchema";
import { buildGroundingContext } from "@/lib/mimir/chatContext";
import { buildChatSystemPrompt } from "@/lib/mimir/prompt";
import { createGetCardDetailsTool } from "@/lib/mimir/tools";

export const dynamic = "force-dynamic";

// D9: per-user turn cap — the larger, previously-unbounded Gemini-quota
// risk identified in the outside-voice review (unlike quiz-submit, chat
// has no D6/D10 cache and calls Gemini fresh every turn).
const MAX_CHAT_TURNS = 20;

// Gemini's own tool-calling loop (runGeminiAgent) isn't itself streamed —
// restructuring it to stream mid-tool-loop would mean streaming partial
// tool-call reasoning the user shouldn't see. Instead the full reply is
// computed server-side as before, then re-emitted to the client in small
// word chunks over SSE (same `data: {...}\n\n` framing as quiz-submit's
// narration stream) so it reads like a live-streaming reply — the same
// UX as ChatGPT, just sourced from an already-complete response rather
// than a token stream from the model itself.
const WORDS_PER_CHUNK = 3;
const CHUNK_DELAY_MS = 35;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        // A turn is one user message (+ its assistant reply) — count only
        // user-role rows, not all rows, or the real cap would be MAX_CHAT_TURNS/2.
        const [turnCountRow] = await db
          .select({ value: count() })
          .from(chatMessages)
          .where(and(eq(chatMessages.userId, user.id), eq(chatMessages.role, "user")));
        const turnCount = turnCountRow?.value ?? 0;

        if (turnCount >= MAX_CHAT_TURNS) {
          emit({
            type: "error",
            message:
              "This conversation has reached its length limit — start a fresh question from your results page.",
          });
          return;
        }

        const groundingContext = await buildGroundingContext(user.id);
        if (!groundingContext) {
          emit({ type: "error", message: "No profile found — complete the quiz first." });
          return;
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
        } catch (err) {
          console.error("[/api/chat] runGeminiAgent threw:", err);
          // Post-outside-voice decision: explicit error, the failed turn is
          // NOT persisted (it would pollute D2's context reconstruction on
          // retry), user can just retry with the same message.
          emit({ type: "error", message: "MIMIR couldn't respond — try again." });
          return;
        }

        if (!agentResult.finalText || agentResult.cappedOut) {
          emit({ type: "error", message: "MIMIR couldn't respond — try again." });
          return;
        }

        await db.insert(chatMessages).values([
          { userId: user.id, role: "user", content: message },
          { userId: user.id, role: "assistant", content: agentResult.finalText },
        ]);

        const words = agentResult.finalText.split(" ");
        for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
          const slice = words.slice(i, i + WORDS_PER_CHUNK).join(" ");
          const isLast = i + WORDS_PER_CHUNK >= words.length;
          emit({ type: "chunk", text: isLast ? slice : slice + " " });
          if (!isLast) await sleep(CHUNK_DELAY_MS);
        }

        emit({ type: "done" });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}
