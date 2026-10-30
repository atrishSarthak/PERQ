import { NextResponse } from "next/server";
import { signupRequestSchema } from "@perq/shared";
import { createUser, EmailTakenError } from "@/lib/users";

// Web registration (the web signs in through Auth.js right after). Shares
// createUser with the mobile signup route so hashing never drifts.
export async function POST(req: Request) {
  const parsed = signupRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email and an 8+ character password are required." },
      { status: 400 }
    );
  }
  try {
    const user = await createUser(parsed.data.email, parsed.data.password);
    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
