import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { nowFor } from "@/lib/money/clock";
import { syncSwiggy } from "@/lib/swiggy/service";

export const dynamic = "force-dynamic";

/** POST /api/swiggy/sync: pull new orders (the app calls this when Home opens). */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  return NextResponse.json({ added: await syncSwiggy(auth.id, await nowFor(auth.id)) });
}
