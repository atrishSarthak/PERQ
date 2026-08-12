import { NextResponse } from "next/server";
import { auth } from "@/auth";

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * Shared auth guard (2A) — called as the first line of every Feature-1
 * route handler and Server Action (quiz/submit, profile edit, chat,
 * arsenal/toggle). One place to harden auth logic later; no route
 * hand-rolls its own session check.
 *
 * Returns either the authed user or a ready-to-return 401 NextResponse —
 * callers do `if (!isAuthed(result)) return result;` instead of a
 * try/catch, keeping the guard a plain first line rather than boilerplate.
 */
export async function requireAuth(): Promise<AuthedUser | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { id: session.user.id, email: session.user.email ?? null };
}

export function isAuthed(
  result: AuthedUser | NextResponse
): result is AuthedUser {
  return !(result instanceof NextResponse);
}
