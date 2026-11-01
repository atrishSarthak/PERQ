import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** DELETE /api/me: delete the account. Every user-owned table cascades from `user` (verified at checkpoint 2). */
export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  await db.delete(users).where(eq(users.id, auth.id));
  return NextResponse.json({ deleted: true });
}
