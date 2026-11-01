import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { demoEnabled } from "@/lib/money/clock";
import { loadDemo } from "@/lib/money/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/demo/load (§13.3): replace this user's financial data with the demo set. DEMO_ENABLED only. */
export async function POST(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  return NextResponse.json(await loadDemo(auth.id));
}
