import { config } from "dotenv";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

// Root .env is the single source of truth for DATABASE_URL across the
// monorepo (Next.js app + this package's CLI scripts).
config({ path: resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;
