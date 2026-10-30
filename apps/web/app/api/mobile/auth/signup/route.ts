import { NextResponse } from "next/server";
import { signupRequestSchema } from "@perq/shared";
import { createUser, EmailTakenError } from "@/lib/users";
import { signMobileToken } from "@/lib/mobileJwt";

export async function POST(req: Request) {
  const parsed = signupRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  try {
    const user = await createUser(parsed.data.email, parsed.data.password, parsed.data.name);
    return NextResponse.json({ token: await signMobileToken(user.id), user }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
