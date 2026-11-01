import { NextResponse } from "next/server";
import { planExtractRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logAgentRun } from "@/lib/ember/agentRunLog";
import { extractFromImage, extractFromText } from "@/lib/plans/extract";
import { extractionsToday, PLAN_DAILY_LIMIT } from "@/lib/plans/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/plans/extract (Step 3 §6, §9): a screenshot or a chat message →
 * an unconfirmed draft. The image lives only in this request's memory: it
 * isn't stored, logged or put in agent_runs (which records only the task).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = planExtractRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Send a screenshot (JPEG, PNG, WebP or HEIC, up to about 6 MB) or a message" }, { status: 400 });
  if ((await extractionsToday(auth.id)) >= PLAN_DAILY_LIMIT) {
    return NextResponse.json({ error: "You've read a lot of screenshots today. Type the details instead, or try tomorrow." }, { status: 429 });
  }
  const apiKey = process.env.GEMINI_DISABLED === "1" ? null : (process.env.GEMINI_API_KEY ?? null);
  const deps = { apiKey, logRun: logAgentRun, userId: auth.id };
  try {
    const out = body.data.kind === "image" ? await extractFromImage(body.data.imageBase64, body.data.mimeType, deps) : await extractFromText(body.data.text, deps);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "I couldn't read that screenshot. Type the details instead." }, { status: 502 });
  }
}
