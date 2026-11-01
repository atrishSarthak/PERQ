import { SignJWT, jwtVerify } from "jose";
import type { StatementDraft } from "@perq/shared";

// The statement draft between parse and confirm (handoff §5.1). Serverless
// instances don't share memory, so instead of a server-side cache the draft
// travels as a signed, 15-minute token. It holds only the extracted figures
// and lines the user is about to review: never the PDF or the password.

export type DraftPayload = Omit<StatementDraft, "parseToken">;

const TTL = "15m";

function key(): Uint8Array {
  const s = process.env.PARSE_TOKEN_SECRET;
  if (!s || s.length < 32) throw new Error("PARSE_TOKEN_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signDraft(userId: string, draft: DraftPayload): Promise<string> {
  return new SignJWT({ draft })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("perq-statement-draft")
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

/** The draft, if the token is valid, unexpired and belongs to this user. */
export async function verifyDraft(userId: string, token: string): Promise<DraftPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "perq-statement-draft", algorithms: ["HS256"] });
    if (payload.sub !== userId) return null;
    return (payload as unknown as { draft: DraftPayload }).draft;
  } catch {
    return null;
  }
}
