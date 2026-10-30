import { palette, radii } from "./tokens";

// Tailwind preset for apps/web. Semantic colours resolve to the CSS custom
// properties in tokens.css (so the light/dark switch is one attribute on
// <html>); raw brand colours are also exposed for the rare fixed-colour case.
export const perqTailwindPreset = {
  theme: {
    extend: {
      colors: {
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "bg-surface-2": "var(--bg-surface-2)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        primary: "var(--primary)",
        "primary-pressed": "var(--primary-pressed)",
        "on-primary": "var(--on-primary)",
        link: "var(--link)",
        ember: "var(--ember)",
        "ember-pressed": "var(--ember-pressed)",
        "on-ember": "var(--on-ember)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        border: "var(--border)",
        navy: {
          DEFAULT: palette.navy,
          700: palette.navy700,
          750: palette.navy750,
          800: palette.navy800,
          900: palette.navy900,
        },
        ice: { DEFAULT: palette.ice, 50: palette.ice50, 300: palette.ice300 },
        electric: { DEFAULT: palette.electric, 400: palette.electric400 },
        chartreuse: { DEFAULT: palette.chartreuse, 600: palette.chartreuse600 },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
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
        sm: `${radii.sm}px`,
        md: `${radii.md}px`,
        lg: `${radii.lg}px`,
      },
    },
  },
};
