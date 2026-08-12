import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // packages/* are consumed as TS source directly (no prebuild step),
  // so Next.js needs to transpile them itself.
  transpilePackages: [
    "@perq/ui",
    "@perq/design-tokens",
    "@perq/scoring-engine",
    "@perq/ai",
    "@perq/db",
  ],
  // A stray lockfile outside this repo (in the user's home directory) makes
  // Next.js misdetect the workspace root — pin it explicitly to this repo.
  outputFileTracingRoot: resolve(__dirname, "../.."),
};

export default nextConfig;
