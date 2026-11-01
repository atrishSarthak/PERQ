import { NextResponse } from "next/server";
import { nudgeUserIds, runNudgeEngine } from "@/lib/money/nudgeEngine";
import { nowFor } from "@/lib/money/clock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 10;

/** GET /api/cron/nudges: the daily run at 03:30 UTC (09:00 IST), Vercel Cron with CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await nudgeUserIds();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < users.length; i += BATCH) {
    const results = await Promise.allSettled(users.slice(i, i + BATCH).map(async (id) => runNudgeEngine(id, await nowFor(id))));
    for (const r of results) {
      if (r.status === "fulfilled") sent += r.value.sent.length;
      else failed++;
    }
  }
  return NextResponse.json({ users: users.length, sent, failed });
}
