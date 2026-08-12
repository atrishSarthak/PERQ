import type { Metadata } from "next";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
