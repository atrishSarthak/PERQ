import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { findPublicUser } from "@/lib/users";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const user = await findPublicUser(auth.id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}
