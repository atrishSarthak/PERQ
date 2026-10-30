import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@perq/db";
import type { PublicUser } from "@perq/shared";

// Shared by web /api/register, Auth.js Credentials and the mobile auth
// routes, so hashing and lookup never drift between them.
const BCRYPT_COST = 10;

// Case-insensitive: accounts created before emails were normalised may be
// stored with capitals.
const emailMatches = (email: string) =>
  sql`lower(${users.email}) = ${email.trim().toLowerCase()}`;

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}

export async function createUser(email: string, password: string, name?: string): Promise<PublicUser> {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(emailMatches(normalized))
    .limit(1);
  if (existing) throw new EmailTakenError();

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const [created] = await db
    .insert(users)
    .values({ email: normalized, passwordHash, name: name ?? null })
    .returning({ id: users.id, email: users.email, name: users.name });
  return created!;
}

/** The user for these credentials, or null. Same check Auth.js Credentials uses. */
export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(emailMatches(email))
    .limit(1);
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email, name: user.name } : null;
}

export async function findPublicUser(id: string): Promise<PublicUser | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}
