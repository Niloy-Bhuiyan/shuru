import type { Metadata, Viewport } from "next";

import { LangProvider } from "@/lib/i18n";
import "./globals.css";

const pixel = { variable: "--font-pixel-x" };

const mono = { variable: "--font-mono-x" };

const bangla = { variable: "--font-bangla-x" };

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
          {/* Hard mobile frame: 390px design baseline, capped at 430px */}
          <div className="relative mx-auto min-h-dvh max-w-app bg-cream">
            {children}
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
