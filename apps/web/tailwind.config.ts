import type { Config } from "tailwindcss";

// Tailwind utility classes are the primary styling approach (PRD §3), but
// color/spacing values still resolve to the locked CSS custom properties in
// packages/design-tokens/src/tokens.css — never a hardcoded hex here.
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        accent: "var(--accent)",
        gold: "var(--gold)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        border: "var(--border)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      // Design System §3 type scale — was previously only defined as raw
      // CSS vars in tokens.css with no Tailwind utility wired to them, so
      // classes like `text-h2`/`text-display` used across the app resolved
      // to nothing and silently fell back to the browser default size.
      fontSize: {
        display: ["var(--text-display-size)", { lineHeight: "1.1" }],
        h1: ["var(--text-h1-size)", { lineHeight: "1.15" }],
        h2: ["var(--text-h2-size)", { lineHeight: "1.25" }],
        "body-lg": ["var(--text-body-lg-size)", { lineHeight: "1.5" }],
        body: ["var(--text-body-size)", { lineHeight: "1.5" }],
        "body-sm": ["var(--text-body-sm-size)", { lineHeight: "1.45" }],
        caption: ["var(--text-caption-size)", { lineHeight: "1.3" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
