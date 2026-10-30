import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyMobileToken } from "./mobileJwt";

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user from EITHER a mobile `Authorization: Bearer <jwt>`
 * header OR the web's Auth.js session cookie (handoff §0.6). Every
 * recommender and Ember route uses this, so web and mobile share one API.
 * A present-but-invalid Bearer token is a hard 401: it never falls back to
 * the cookie.
 */
export async function getAuthedUser(req?: Request): Promise<AuthedUser | null> {
  const header = req?.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const userId = await verifyMobileToken(header.slice(7).trim());
    return userId ? { id: userId, email: null } : null;
  }
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/**
 * Route guard: the authed user, or a ready-to-return 401. Callers do
 * `if (!isAuthed(result)) return result;`. Pass the request so mobile
 * Bearer tokens are honoured.
 */
export async function requireAuth(req?: Request): Promise<AuthedUser | NextResponse> {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return user;
}

export function isAuthed(result: AuthedUser | NextResponse): result is AuthedUser {
  return !(result instanceof NextResponse);
}
