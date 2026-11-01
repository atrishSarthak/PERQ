import { NextResponse } from "next/server";
import { db, pushTokens } from "@perq/db";
import { pushRegisterSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/push/register: save this device's Expo push token. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = pushRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  const now = new Date();
  // A token moves to whoever signed in on the device most recently.
  await db
    .insert(pushTokens)
    .values({ userId: auth.id, expoToken: body.data.token, platform: body.data.platform, lastSeenAt: now })
    .onConflictDoUpdate({ target: pushTokens.expoToken, set: { userId: auth.id, platform: body.data.platform, lastSeenAt: now } });
  return NextResponse.json({ ok: true });
}
