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
        {/* Design System §3: Cabinet Grotesk for display type, Switzer for
            body/UI text. Neither is on Google Fonts — both loaded from
            Fontshare in one request, whose stylesheet defines the exact
            family names --font-display/--font-body already reference. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&f[]=switzer@400,500,600,700&display=swap"
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
