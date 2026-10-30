import { NextResponse } from "next/server";
import packageJson from "../../../package.json";

export const dynamic = "force-dynamic";

/** Reachability check for the mobile Diagnostics screen (handoff §0.8). */
export function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? packageJson.version,
    time: new Date().toISOString(),
  });
}
