import type { Metadata, Viewport } from "next";
import { Silkscreen, JetBrains_Mono, Hind_Siliguri } from "next/font/google";

import { LangProvider } from "@/lib/i18n";
import "./globals.css";

/*
 * THE FONTS WERE NEVER LOADED.
 *
 * These three were stub objects declaring `--font-pixel-x`, `--font-mono-x`
 * and `--font-bangla-x`. tailwind.config.ts asks for `--font-pixel`,
 * `--font-mono` and `--font-bangla` — without the `-x` — and nothing defined
 * those anywhere, so every `font-pixel` heading in the app silently fell back
 * to plain monospace and the pixel design system never rendered at all.
 *
 * next/font self-hosts these at build time and serves them from the app's own
 * origin, which also keeps them inside `font-src 'self'` in the CSP. No
 * request to Google is made at runtime.
 *
 * Silkscreen rather than Press Start 2P: this design uses the pixel face at
 * 9-13px constantly, and Press Start 2P is illegible at that size.
 */
const pixel = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

// Bengali is a first-class language here, not a fallback — the toggle is in
// the header of every screen.
const bangla = Hind_Siliguri({
  weight: ["400", "600", "700"],
  subsets: ["bengali", "latin"],
  display: "swap",
  variable: "--font-bangla",
});

export const metadata: Metadata = {
  title: "Shuru — শুরু",
  description:
    "Find internships in Bangladesh and see your honest, calibrated chances of getting shortlisted.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4E9D8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${pixel.variable} ${mono.variable} ${bangla.variable}`}>
      <body className="font-mono">
        <LangProvider>
          {/*
            Mobile keeps the hard 390/430px frame the design is built on.
            From `lg` the frame widens to a desktop shell — the app shell
            (src/app/(main)/layout.tsx) turns that extra width into a sidebar
            plus content column rather than stretching mobile layouts across
            a monitor.
          */}
          <div
            data-app-frame
            className="relative mx-auto min-h-dvh max-w-app bg-cream lg:max-w-[1120px] lg:border-x-3 lg:border-ink"
          >
            {children}
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
