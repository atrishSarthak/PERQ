"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "perq-theme";

/**
 * Explicit light/dark override, persisted to localStorage and applied via
 * the `data-theme` attribute tokens.css already keys off. app/layout.tsx's
 * blocking init script applies a saved choice before first paint; this
 * component reads that same value on mount so the toggle's label starts in
 * sync rather than flashing "Dark mode" while already in dark mode.
 */
export function DarkModeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: "light" | "dark" =
      stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-body text-body-sm text-text-primary"
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
