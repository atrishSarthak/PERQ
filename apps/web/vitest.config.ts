import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  // tsconfig.json sets "jsx": "preserve" (correct for Next's own SWC
  // compiler in `next build`/`next dev`), but Vitest's esbuild reads the
  // same tsconfig and, taken literally, leaves JSX untransformed for
  // tests, causing a runtime "React is not defined" the app itself never
  // hits. Override esbuild's JSX handling for the test run only.
  esbuild: {
    jsx: "automatic",
  },
});
