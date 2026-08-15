// Exact values from design-reference/PERQ Dashboard standalone.html. This
// dashboard is a deliberately fixed dark design — unlike the rest of the
// app it doesn't adapt to the light/dark toggle (the mockup has no light
// variant, and the task's palette is specified as literal hex, not a
// mapping onto the adaptive tokens) — so these are plain hex/rgb, not
// var(--bg-base) etc. Brand accents (gold, blue) still reference the
// shared design tokens (packages/design-tokens) since those already match
// exactly and should stay in sync with the rest of the app.
export const DASHBOARD_COLORS = {
  pageBg: "#000000",
  surface: "#18181B",
  surfaceBorder: "rgba(255,255,255,0.06)",
  textPrimary: "#FAFAF9",
  textSecondary: "#A1A1AA",
  textTertiary: "#71717A",
  innerBorder08: "rgba(255,255,255,0.08)",
  innerBorder12: "rgba(255,255,255,0.12)",
  innerBorder14: "rgba(255,255,255,0.14)",
  inputBg: "#0F0F11",
  inputPlaceholder: "#6B6B72",
} as const;
