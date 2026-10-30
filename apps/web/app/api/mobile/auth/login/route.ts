import { NextResponse } from "next/server";
import { loginRequestSchema } from "@perq/shared";
import { verifyCredentials } from "@/lib/users";
import { signMobileToken } from "@/lib/mobileJwt";

export async function POST(req: Request) {
  const parsed = loginRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  return NextResponse.json({ token: await signMobileToken(user.id), user });
}
