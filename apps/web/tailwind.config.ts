import type { Config } from "tailwindcss";
import { perqTailwindPreset } from "@perq/design-tokens/src/tailwindPreset";

// All colour/type/radius values come from packages/design-tokens (one source
// of truth shared with apps/mobile) — never a hardcoded hex here.
const config: Config = {
  // design-tokens has no tailwindcss dependency, so its preset is untyped here.
  presets: [perqTailwindPreset as unknown as Partial<Config>],
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [],
};

export default config;
