import { SignJWT, jwtVerify } from "jose";

// Mobile token auth (handoff §0.6): HS256, 30-day expiry, signed with
// MOBILE_JWT_SECRET. Server-side only — the secret never reaches a client.
const ISSUER = "perq";
const AUDIENCE = "perq-mobile";
export const MOBILE_TOKEN_TTL = "30d";

function secretKey(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MOBILE_JWT_SECRET is not set (or shorter than 32 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(MOBILE_TOKEN_TTL)
    .sign(secretKey());
}

/** The user id in a valid token, or null for anything invalid or expired. */
export async function verifyMobileToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
