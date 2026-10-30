import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { nativeTheme, type NativeTheme } from "@perq/design-tokens";

// Theme preference (handoff §0.7): system / dark / light, dark by default.
export type ThemePreference = "system" | "dark" | "light";
const PREF_KEY = "perq.theme.preference";

interface ThemeContextValue {
  theme: NativeTheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>("dark");

  useEffect(() => {
    Promise.resolve()
      .then(() => SecureStore.getItemAsync(PREF_KEY))
      .then((v) => {
        if (v === "system" || v === "dark" || v === "light") setPref(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const name = preference === "system" ? (system === "light" ? "light" : "dark") : preference;
    return {
      theme: nativeTheme(name),
      preference,
      setPreference: (p) => {
        setPref(p);
        Promise.resolve()
          .then(() => SecureStore.setItemAsync(PREF_KEY, p))
          .catch(() => {});
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export function useTheme(): NativeTheme {
  return useThemeContext().theme;
}
