import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, users } from "@perq/db";
import { eq } from "drizzle-orm";

// PRD §6: Auth.js (NextAuth), Drizzle adapter, Postgres-backed sessions.
// Default: email/password to start. Google OAuth is an easy low-friction
// add later (PRD §15) — not wired here, not a blocking decision.
//
// Explicit NextAuthResult annotation works around a pnpm-monorepo type-
// portability error (TS2742): without it, TS tries to structurally name
// the inferred return type via a node_modules path that isn't stably
// importable across the workspace's nested dependency tree.
const nextAuth: NextAuthResult = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // JWT sessions don't carry the DB user id onto session.user by default —
    // requireAuth() (2A) depends on session.user.id being present, so it
    // has to be threaded through explicitly here.
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
