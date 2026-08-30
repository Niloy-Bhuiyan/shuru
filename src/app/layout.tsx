import type { Metadata, Viewport } from "next";
import {
  Silkscreen,
  JetBrains_Mono,
  Hind_Siliguri,
  Inter,
  Instrument_Serif,
} from "next/font/google";

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

/*
 * The conventional-UI face, used by surfaces that opt out of the pixel system
 * via `.ui-pro` (see globals.css). Silkscreen is a display face that only
 * works in short, large bursts; anything with real paragraphs needs a text
 * face, and the mono was carrying that load by default.
 */
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

/*
 * Display face, used ONLY for the largest headlines on the public site.
 *
 * Inter set large is competent and completely anonymous — it is the default
 * of every SaaS landing page, which is exactly why a page built from it reads
 * as a template. A serif at display size costs one font request and is the
 * single cheapest way to make the page look authored.
 *
 * Restricted to English display text on purpose: it has no Bengali coverage,
 * and it is far too high-contrast to set body copy in.
 */
const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const DESCRIPTION =
  "Find internships in Bangladesh and see your honest, calibrated chances of getting shortlisted.";

/*
 * `metadataBase` is what turns the relative asset paths below — and the
 * `opengraph-image.png` sitting next to this file — into the absolute URLs
 * that link unfurlers require. Without it Next emits relative og:image paths,
 * which every social crawler drops on the floor, and the card renders blank.
 *
 * The localhost fallback only ever applies in development; NEXT_PUBLIC_SITE_URL
 * is set on Production.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Shuru — শুরু",
    // Sub-pages set a bare title; this keeps the brand on the end of it.
    template: "%s · Shuru",
  },
  description: DESCRIPTION,
  applicationName: "Shuru",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Shuru",
    title: "Shuru — শুরু",
    description: DESCRIPTION,
    // Bengali first: this is a Bangladesh product, and `en` is the alternate.
    locale: "bn_BD",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shuru — শুরু",
    description: DESCRIPTION,
  },
  /*
   * iOS only delivers Web Push to sites the user has added to the Home Screen,
   * and it will only offer that for an installable site. The app already ships
   * a push service worker (public/sw.js), so without this block that feature
   * is unreachable on iPhone — which is most of the audience.
   */
  appleWebApp: {
    capable: true,
    title: "Shuru",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /*
   * The browser/PWA chrome colour. It has to match `html { background }` in
   * globals.css or the notch and status bar sit in a visibly different colour
   * from the page beneath them. This was still #F4E9D8 — the cream of the
   * retired pixel palette — which no surface in the app uses any more.
   */
  themeColor: "#F8FAFC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${pixel.variable} ${mono.variable} ${bangla.variable} ${sans.variable} ${display.variable}`}
    >
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
            className="relative mx-auto min-h-dvh max-w-app bg-cream lg:max-w-[1120px] lg:border-x lg:border-ui-line"
          >
            {children}
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
