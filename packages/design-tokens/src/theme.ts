import { fontSizes, radii, spacing, themes, type ThemeColors, type ThemeName } from "./tokens";

// React Native theme for apps/mobile. Font family names match the keys the
// mobile app registers with expo-font (apps/mobile/src/theme/fonts.ts).
export const nativeFonts = {
  display: "CabinetGrotesk-Bold",
  displayExtra: "CabinetGrotesk-Extrabold",
  body: "LexendDeca_400Regular",
  bodyMedium: "LexendDeca_500Medium",
  bodySemi: "LexendDeca_600SemiBold",
} as const;

export interface NativeTheme {
  name: ThemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  fontSizes: typeof fontSizes;
  fonts: typeof nativeFonts;
}

export function nativeTheme(name: ThemeName): NativeTheme {
  return { name, colors: themes[name], spacing, radii, fontSizes, fonts: nativeFonts };
}
