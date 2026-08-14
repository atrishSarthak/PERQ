import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PERQ — MIMIR",
  description: "MIMIR recommends the right credit card for you.",
};

// Design System §3: Inter for body/UI text. Self-hosted via next/font (no
// runtime request to Google Fonts), exposed as a CSS variable that
// globals.css wires into the --font-body token.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Design System §3: Cabinet Grotesk for display type. Not on
            Google Fonts — loaded from Fontshare, whose stylesheet defines
            the exact "Cabinet Grotesk" family the --font-display token
            already names. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&display=swap"
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
