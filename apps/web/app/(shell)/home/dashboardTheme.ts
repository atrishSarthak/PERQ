import { palette } from "@perq/design-tokens";

// The dashboard is a deliberately fixed dark design (it doesn't follow the
// light/dark toggle), so it reads the dark palette directly from
// packages/design-tokens rather than the adaptive CSS variables.
export const DASHBOARD_COLORS = {
  pageBg: palette.navy900,
  surface: palette.navy800,
  surfaceBorder: "rgba(226,234,238,0.08)",
  textPrimary: palette.ice,
  textSecondary: palette.ice300,
  textTertiary: "#8C9BB0",
  innerBorder08: "rgba(226,234,238,0.08)",
  innerBorder12: "rgba(226,234,238,0.12)",
  innerBorder14: "rgba(226,234,238,0.14)",
  inputBg: palette.navy900,
  inputPlaceholder: "#8C9BB0",
} as const;
