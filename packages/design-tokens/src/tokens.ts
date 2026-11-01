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

  // Black + charcoal + ember red (Nov 2026 restyle, DECISIONS #172). The app
  // themes use these; the navy/ice/chartreuse set above stays for raw web use.
  charcoal: "#252525", // cards / surfaces on black (gradient top)
  charcoalDeep: "#121212", // card gradient bottom, fading toward the black page
  charcoal750: "#2D2D2D", // nested surface
  charcoal700: "#363636", // borders, dividers
  grey300: "#A1A1A6", // muted text on dark
  smoke: "#F5F5F7", // body text on dark
  red: "#971211", // primary fill (buttons, tab highlight), white text on it
  redPressed: "#7A0E0D",
  brightRed: "#E8221F", // red text on dark: same hue as `red`, bright enough to read (DECISIONS #175)
  lightGrey: "#F2F2F4", // light background
  lightGrey100: "#E8E8EB", // nested surface on light
  lightBorderGrey: "#D6D6DB",
  ink: "#141416", // text on light
  inkMuted: "#5E5E66", // muted text on light
} as const;

// --- Semantic roles per theme ---
// `primary` = primary button fill (deep red, white text) in both themes.
// `surfaceDeep` = where a card's gradient ends (surface at the top, darker below).
// `link` = links / focus rings / accent text.
// `ember` = Ember's accent for shapes (fills, borders, the selected tab): the
// founder's red #971211 in both themes. `emberText` = red text; on dark it's a
// brighter red of the same hue, since #971211 text on black reads at ~2:1.
// `onEmber` = text placed ON an ember-coloured fill (white).
export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  /** Bottom stop of the surface gradient on cards (top is `surface`). */
  surfaceDeep: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  link: string;
  ember: string;
  emberPressed: string;
  /** Red text: Ember labels, ₹ highlights. `ember` itself is for shapes (fills, borders, the selected tab). */
  emberText: string;
  onEmber: string;
  success: string;
  warning: string;
  danger: string;
}

export const themes: Record<"dark" | "light", ThemeColors> = {
  dark: {
    bg: palette.black,
    surface: palette.charcoal,
    surface2: palette.charcoal750,
    surfaceDeep: palette.charcoalDeep,
    border: palette.charcoal700,
    text: palette.smoke,
    textMuted: palette.grey300,
    primary: palette.red,
    primaryPressed: palette.redPressed,
    onPrimary: palette.white,
    link: palette.brightRed,
    ember: palette.red,
    emberPressed: palette.redPressed,
    emberText: palette.brightRed,
    onEmber: palette.white,
    success: "#34C77B",
    warning: "#F0A23B",
    danger: "#FF453A",
  },
  light: {
    bg: palette.lightGrey,
    surface: palette.white,
    surface2: palette.lightGrey100,
    surfaceDeep: palette.lightGrey100,
    border: palette.lightBorderGrey,
    text: palette.ink,
    textMuted: palette.inkMuted,
    primary: palette.red,
    primaryPressed: palette.redPressed,
    onPrimary: palette.white,
    link: palette.red,
    ember: palette.red,
    emberPressed: palette.redPressed,
    emberText: palette.red,
    onEmber: palette.white,
    success: "#2A8F6A", // darker green so ₹ positives pass AA on the light background
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
