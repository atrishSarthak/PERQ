// JS-consumable mirror of tokens.css, for Tailwind config extension and any
// component that needs a token value outside of plain CSS (e.g. a computed
// inline style). The CSS custom properties in tokens.css remain the source
// of truth for actual rendering — these are var() references, not
// hardcoded hex values, so a token change never has to happen in two places.

export const colors = {
  white: "var(--color-white)",
  black: "var(--color-black)",
  accent: "var(--accent)",
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  border: "var(--border)",
} as const;

export const fonts = {
  display: "var(--font-display)",
  body: "var(--font-body)",
} as const;

export const spacing = {
  1: "var(--space-1)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  12: "var(--space-12)",
  16: "var(--space-16)",
} as const;

export const radius = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
} as const;
