import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PERQ — MIMIR",
  description: "MIMIR recommends the right credit card for you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the beforeInteractive theme-init script
    // below sets data-theme on this element from localStorage before React
    // hydrates, which SSR has no way to predict — an expected, single-
    // attribute mismatch (the standard next-themes pattern), not a bug.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Design System §3: Cabinet Grotesk for display type, loaded from
            Fontshare (not on Google Fonts) — its stylesheet defines the
            exact family name --font-display references. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&display=swap"
        />
        {/* Body/UI text — Lexend Deca, loaded from Google Fonts; family
            name matches --font-body in tokens.css. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {/* Applies a saved dark/light choice before first paint so the
            page never flashes the wrong theme; DarkModeToggle keeps this
            in sync after hydration. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('perq-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
