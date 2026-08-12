import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, users } from "@perq/db";
import { eq } from "drizzle-orm";

// Minimal registration endpoint — necessary plumbing for email/password
// auth (PRD §6 default) to be real, not a Feature 1 deliverable in its own
// right. No admin panel, no extra fields — just enough to create an
// authenticatable account.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : null;
  const password = typeof body?.password === "string" ? body.password : null;

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Email and an 8+ character password are required." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning({ id: users.id, email: users.email });

  return NextResponse.json({ user: created }, { status: 201 });
}
