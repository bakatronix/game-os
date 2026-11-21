import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

export const metadata: Metadata = {
  title: "Game OS",
  description: "Llama & Griffin operator surface for indie studio executives.",
};

// Self-hosted (app/fonts, SIL Open Font License) so builds never fetch from
// Google Fonts: a bad reply from Google used to fail the whole build.
// Both are variable fonts (latin subset), so one file covers each weight range.
const archivo = localFont({
  src: [{ path: "./fonts/archivo-latin.woff2", weight: "700 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
const sourceSans = localFont({
  src: [{ path: "./fonts/source-sans-3-latin.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
