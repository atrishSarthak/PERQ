import { defineConfig } from "vitest/config";

// Unit tests cover the platform-free modules (API client core, quiz reducer).
// Screens are checked on device in Expo Go (docs/RUNNING.md).
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
