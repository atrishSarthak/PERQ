import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { hasConsent } from "@/lib/money/consent";
import { nowFor } from "@/lib/money/clock";
import { upcomingNudges } from "@/lib/money/nudgeEngine";

export const dynamic = "force-dynamic";

/** GET /api/nudges/upcoming: the next 7 days of nudges, for local notifications in Expo Go. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  if (!(await hasConsent(auth.id, "notifications"))) return NextResponse.json({ upcoming: [] });
  return NextResponse.json({ upcoming: await upcomingNudges(auth.id, await nowFor(auth.id)) });
}
