// PERQ design tokens — the single source of truth (handoff §3, locked).
// Plain objects with literal values, so they work in React Native as well as
// on the web. Consumers:
//   - apps/web: tailwindPreset.ts (Tailwind) + tokens.css, which is GENERATED
//     from this file by scripts/build-css.ts (never edit tokens.css by hand;
//     test/tokens.test.ts fails if it drifts)
//   - apps/mobile: theme.ts (`themes.dark` / `themes.light`)

// --- Brand palette (sampled from the brand swatches) ---
export const palette = {
  navy: "#1B1C45", // Midnight Navy, Pantone 2768 CP
  ice: "#E2EAEE", // Ice Blue, P 115-9 C
  electric: "#2B4A8E", // Electric Blue, P 104-8 C
  chartreuse: "#E0D847", // Chartreuse, P 166-8 C

  // Derived (handoff §3 table)
  navy900: "#12132F", // dark background (app default)
  navy800: "#1B1C45", // cards / surfaces on dark
  navy750: "#222452", // nested surface on dark — one step between 800 and 700 (DECISIONS.md)
  navy700: "#2A2C5E", // borders, dividers on dark
  electric400: "#5B7FD1", // links + focus rings on dark (raw electric is too dark on navy)
  ice50: "#F4F7F9", // light background
  ice100: "#E9EEF2", // nested surface on light (DECISIONS.md)
  ice300: "#B9C7CF", // muted text on dark
  slate500: "#5A6378", // muted text on light
  lightBorder: "#D3DCE2", // borders on light (DECISIONS.md)
  chartreuse600: "#B8B01F", // chartreuse pressed state
  success: "#3FB68B",
  danger: "#E5484D",
  warning: "#E59A3B", // kept from the old system's semantic set (DECISIONS.md)
  white: "#FFFFFF",
  black: "#000000",
} as const;

// --- Semantic roles per theme ---
// `primary` = primary button fill (electric, white text) in both themes.
// `link` = links / focus rings / accent text.
// `ember` = Ember's accent: chartreuse on dark, electric on light (chartreuse
// text on light backgrounds fails contrast — never use it there).
// `onEmber` = text placed ON an ember-coloured fill (navy on chartreuse).
export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  link: string;
  ember: string;
  emberPressed: string;
  onEmber: string;
  success: string;
  warning: string;
  danger: string;
}

export const themes: Record<"dark" | "light", ThemeColors> = {
  dark: {
    bg: palette.navy900,
    surface: palette.navy800,
    surface2: palette.navy750,
    border: palette.navy700,
    text: palette.ice,
    textMuted: palette.ice300,
    primary: palette.electric,
    primaryPressed: "#223B72",
    onPrimary: palette.white,
    link: palette.electric400,
    ember: palette.chartreuse,
    emberPressed: palette.chartreuse600,
    onEmber: palette.navy,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
  },
  light: {
    bg: palette.ice50,
    surface: palette.white,
    surface2: palette.ice100,
    border: palette.lightBorder,
    text: palette.navy,
    textMuted: palette.slate500,
    primary: palette.electric,
    primaryPressed: "#223B72",
    onPrimary: palette.white,
    link: palette.electric,
    ember: palette.electric,
    emberPressed: "#223B72",
    onEmber: palette.white,
    success: "#2A8F6A", // darker green so ₹ positives pass AA on ice-50
    warning: "#B8741F",
    danger: "#C9373C",
  },
};

export const DEFAULT_THEME = "dark" as const;

// 4-pt spacing scale (key = multiples of 4px).
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSizes = {
  caption: 12,
  bodySm: 14,
  body: 16,
  bodyLg: 18,
  h2: 26,
  h1: 36,
  display: 56,
} as const;

export const fontFamilies = {
  // Web: CSS family names (Fontshare + Google Fonts).
  display: "Cabinet Grotesk",
  body: "Lexend Deca",
} as const;

export type ThemeName = keyof typeof themes;
